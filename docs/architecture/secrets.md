# Secrets Management Architecture

## Overview

Origan uses envelope encryption to securely manage environment secrets. Secrets are encrypted at rest in the database and S3, and only decrypted just-in-time when needed by the runner.

## Key Components

### Encryption Keys

1. **KEK (Key Encryption Key)**
   - Stored as a Kubernetes secret
   - Never leaves the codec service
   - Used to encrypt/decrypt DEKs

2. **DEK (Data Encryption Key)**
   - Unique per project
   - Encrypted with KEK and stored in database
   - Used to encrypt/decrypt environment secrets

### Services

1. **Codec Service**
   - Lightweight Node.js service (~50MB container)
   - Runs inside Kubernetes cluster only (not web-exposed)
   - Holds KEK in memory from K8s secret
   - Provides encrypt/decrypt operations
   - Implements DEK caching for performance

2. **Control API**
   - Manages environment variables
   - Stores encrypted secrets in database
   - Calls codec service for encryption operations

3. **Runner**
   - Fetches encrypted secrets from S3 metadata
   - Calls codec service to decrypt at runtime
   - Injects plain environment variables into worker

## Data Model

### Database Schema

```sql
-- Environment variables stored in environment_revisions table
variables JSONB:
{
  "API_URL": {
    "type": "plain",
    "value": "https://api.example.com"
  },
  "DATABASE_URL": {
    "type": "secret",
    "encrypted": true,
    "value": "encrypted_base64_string",
    "keyVersion": 1
  }
}

-- Project DEK stored in project table
project.encrypted_dek: TEXT -- base64 encoded encrypted DEK
```

### S3 Metadata Structure

```json
// deployments/{deploymentId}/metadata.json
{
  "projectId": "uuid",
  "encryptedDEK": "base64_encrypted_dek",
  "environmentVariables": {
    "API_URL": {
      "type": "plain",
      "value": "https://api.example.com"
    },
    "DATABASE_URL": {
      "type": "secret",
      "encrypted": true,
      "value": "encrypted_with_dek_base64"
    }
  }
}
```

## Encryption Flow

### Creating/Updating Secrets

1. User sets environment variable in admin UI
2. Admin UI marks sensitive values as secrets
3. Control API receives the request
4. Control API calls codec service to encrypt the value:
   - Codec service decrypts project DEK using KEK
   - Encrypts the secret value with DEK
   - Returns encrypted value
5. Control API stores encrypted value in database
6. New environment revision created with audit trail

### Build Time

1. Build process fetches environment variables from database
2. Includes encrypted DEK in deployment metadata
3. Uploads metadata.json to S3 with encrypted secrets

### Runtime Decryption

1. Runner receives request with deployment ID
2. Fetches metadata.json from S3
3. Identifies encrypted secrets in environment variables
4. Calls codec service to decrypt:
   ```typescript
   // Step 1: Decrypt the DEK
   POST /decrypt-dek
   {
     "encryptedDEK": "...",
     "projectId": "..."
   }
   
   // Step 2: Decrypt each secret
   POST /decrypt-value
   {
     "encrypted": "...",
     "dek": "..."
   }
   ```
5. Codec service:
   - Uses KEK to decrypt DEK (with caching)
   - Uses DEK to decrypt secret values
   - Returns plain values
6. Runner injects plain environment variables into worker
7. Worker starts with decrypted environment

## Codec Service API

### Endpoints

```typescript
POST /encrypt
{
  "projectId": "uuid",
  "value": "plaintext_secret"
}
Response: { "encrypted": "base64_encrypted_value" }

POST /decrypt-dek
{
  "encryptedDEK": "base64_encrypted_dek",
  "projectId": "uuid"
}
Response: { "dek": "base64_decrypted_dek" }

POST /decrypt-value
{
  "encrypted": "base64_encrypted_value",
  "dek": "base64_dek"
}
Response: { "value": "plaintext_secret" }

POST /decrypt-all
{
  "projectId": "uuid",
  "deploymentId": "uuid",
  "variables": { /* encrypted variables object */ }
}
Response: { /* plain key-value pairs */ }
```

### Implementation

```typescript
// codec-service.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

class CodecService {
  private kek: Buffer;
  private dekCache = new Map<string, {dek: Buffer, expires: number}>();
  
  constructor() {
    // Load KEK from K8s mounted secret
    this.kek = Buffer.from(process.env.KEK_SECRET!, 'base64');
  }

  async encryptDEK(dek: Buffer): Promise<string> {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.kek, iv);
    
    const encrypted = Buffer.concat([
      iv,
      cipher.update(dek),
      cipher.final(),
      cipher.getAuthTag()
    ]);
    
    return encrypted.toString('base64');
  }

  async decryptDEK(encryptedDEK: string, projectId: string): Promise<Buffer> {
    // Check cache first
    const cached = this.dekCache.get(projectId);
    if (cached && cached.expires > Date.now()) {
      return cached.dek;
    }
    
    // Decrypt with KEK
    const encrypted = Buffer.from(encryptedDEK, 'base64');
    const iv = encrypted.slice(0, 16);
    const authTag = encrypted.slice(-16);
    const ciphertext = encrypted.slice(16, -16);
    
    const decipher = createDecipheriv('aes-256-gcm', this.kek, iv);
    decipher.setAuthTag(authTag);
    
    const dek = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    
    // Cache for 5 minutes
    this.dekCache.set(projectId, {
      dek,
      expires: Date.now() + 5 * 60 * 1000
    });
    
    return dek;
  }

  async encryptValue(value: string, dek: Buffer): Promise<string> {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    
    const encrypted = Buffer.concat([
      iv,
      cipher.update(value, 'utf8'),
      cipher.final(),
      cipher.getAuthTag()
    ]);
    
    return encrypted.toString('base64');
  }

  async decryptValue(encrypted: string, dek: Buffer): Promise<string> {
    const data = Buffer.from(encrypted, 'base64');
    const iv = data.slice(0, 16);
    const authTag = data.slice(-16);
    const ciphertext = data.slice(16, -16);
    
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }
}
```

## Security Measures

### Network Isolation

```yaml
# NetworkPolicy for codec service
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: codec-service-access
spec:
  podSelector:
    matchLabels:
      app: codec-service
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: control-api
    - podSelector:
        matchLabels:
          role: runner
```

### Authentication

- Service-to-service authentication using shared tokens
- Tokens stored as K8s secrets and injected as env vars
- Example header: `X-Service-Auth: ${INTERNAL_SERVICE_TOKEN}`

### Audit Logging

```typescript
// Log all decrypt operations
async decrypt(projectId, deploymentId, caller) {
  await auditLog.record({
    action: 'SECRET_DECRYPT',
    projectId,
    deploymentId,
    timestamp: new Date(),
    caller
  });
  // ... perform decryption
}
```

### Time-bound Access

- Validate deployment recency before allowing decryption
- DEK cache expires after 5 minutes
- Consider implementing secret rotation schedules

## Migration Plan

### Phase 1: Infrastructure
1. Deploy codec service to Kubernetes
2. Generate and store KEK in K8s secret
3. Add encrypted_dek column to project table

### Phase 2: Database Schema
1. Update environment_revisions.variables to new schema
2. Migrate existing variables (mark all as "plain")
3. Generate DEK for each project

### Phase 3: API Integration
1. Update Control API to use codec service
2. Modify environment variable CRUD operations
3. Add secret/plain classification in UI

### Phase 4: Runtime Integration
1. Update build process to include encrypted DEK
2. Modify runner to decrypt secrets at runtime
3. Test with sample deployments

### Phase 5: UI Enhancements
1. Add secret toggle in environment variable UI
2. Implement value masking for secrets
3. Add reveal button for authorized users

## Performance Considerations

- DEK caching reduces codec service calls
- Batch decryption endpoint for multiple secrets
- Consider connection pooling for codec service clients
- Monitor codec service latency and scale horizontally if needed

## Future Enhancements

1. **Key Rotation**
   - Automated KEK rotation
   - Project DEK rotation
   - Track keyVersion for gradual migration

2. **External Secret Providers**
   - Integration with AWS Secrets Manager
   - HashiCorp Vault support
   - Azure Key Vault integration

3. **Enhanced Security**
   - Hardware Security Module (HSM) support
   - Secret scanning in code
   - Automatic secret rotation reminders

4. **Compliance**
   - Detailed audit logs for compliance
   - Secret access policies
   - Data residency controls