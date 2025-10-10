# RFC: Local Domain Testing with Pebble ACME Server

**Date:** 2025-10-09
**Status:** Draft
**Author:** System

## Overview

### Current State
- Custom domains feature implemented with Let's Encrypt ACME integration
- Control API requires `ACME_ACCOUNT_KEY` environment variable
- Production uses Let's Encrypt production/staging servers
- Local development cannot test domain issuance flow (Let's Encrypt requires publicly accessible endpoints)

### Problem
Developers need to test the complete domain issuance process locally, including:
1. Domain registration and validation
2. ACME HTTP-01 challenge flow
3. Certificate generation and deployment
4. Error handling and edge cases

However, Let's Encrypt (even staging) requires:
- Publicly accessible HTTP endpoints for HTTP-01 challenge
- Real DNS resolution
- Valid domains (not `localhost` or private IPs)

### Goals
1. Run a local ACME server (Pebble) that mimics Let's Encrypt
2. Use `localtest.me` wildcard domains (resolves to `127.0.0.1` via public DNS)
3. Enable full domain issuance testing without tunneling services
4. Keep docker-compose configuration simple and maintainable
5. Allow developers to test the full flow end-to-end

## Solution: Pebble + localtest.me

### Why Pebble?
[Pebble](https://github.com/letsencrypt/pebble) is Let's Encrypt's official ACME test server:
- ✅ Implements ACME v2 protocol (RFC 8555)
- ✅ Supports HTTP-01 and DNS-01 challenges
- ✅ Issues real (but untrusted) certificates
- ✅ Runs entirely locally
- ✅ No rate limits
- ✅ Maintained by Let's Encrypt team

### Why localtest.me?
`localtest.me` and all its subdomains resolve to `127.0.0.1`:
- ✅ No `/etc/hosts` configuration needed
- ✅ Works in browser immediately
- ✅ Works in Docker containers (via public DNS)
- ✅ Pebble can validate via HTTP-01 challenge
- ✅ No tunneling services required

**Alternatives:**
- `vcap.me` → 127.0.0.1
- `lvh.me` → 127.0.0.1
- `nip.io` → Dynamic (e.g., `myapp.127.0.0.1.nip.io`)
- `sslip.io` → Similar to nip.io

**Example domains:**
- `myapp.localtest.me:3000` → Works in browser
- `api.localtest.me:3000` → Works in browser
- `feature-auth.localtest.me:3000` → Works in browser

## Architecture

### Docker Compose Setup

```yaml
# docker-compose.yml (development additions)

services:
  # DNS server for resolving *.localtest.me to gateway container
  dnsmasq:
    image: jpillora/dnsmasq
    ports:
      - "53:53/udp"
    volumes:
      - ./docker/dnsmasq.conf:/etc/dnsmasq.conf
    networks:
      origan-network:
        ipv4_address: 172.20.0.2
    cap_add:
      - NET_ADMIN

  # Pebble ACME server (Let's Encrypt test server)
  pebble:
    image: letsencrypt/pebble:latest
    command: pebble -config /test/config/pebble-config.json
    ports:
      - "14000:14000"  # ACME directory
      - "15000:15000"  # Management API
    environment:
      PEBBLE_VA_NOSLEEP: 1  # Skip challenge delays
    dns:
      - 172.20.0.2  # Use dnsmasq for DNS resolution
      - 8.8.8.8     # Fallback
    networks:
      origan-network:
        ipv4_address: 172.20.0.3
    depends_on:
      - dnsmasq

  gateway:
    # ... existing config ...
    ports:
      - "80:80"    # Required for ACME HTTP-01 challenge
      - "443:443"
      - "3000:3000"
    environment:
      TRUST_PEBBLE_CA: ${TRUST_PEBBLE_CA:-true}
    networks:
      origan-network:
        ipv4_address: 172.20.0.10  # Static IP for dnsmasq

  control-api:
    # ... existing config ...
    environment:
      # Development ACME configuration
      ACME_SERVER_URL: ${ACME_SERVER_URL:-https://pebble:14000/dir}
      ACME_ACCOUNT_KEY: ${ACME_ACCOUNT_KEY:-}  # Can be empty for Pebble
      ACME_SKIP_TLS_VERIFY: ${ACME_SKIP_TLS_VERIFY:-true}  # Pebble uses self-signed cert
      DOMAIN_SUFFIX: ${DOMAIN_SUFFIX:-localtest.me}  # For local development
    depends_on:
      - pebble
      - gateway
    networks:
      origan-network:
        ipv4_address: 172.20.0.11

networks:
  origan-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
```

### dnsmasq Configuration

Create `docker/dnsmasq.conf`:

```conf
# Resolve all *.localtest.me to gateway container IP
address=/localtest.me/172.20.0.10

# Log queries for debugging
log-queries

# Don't read /etc/hosts
no-hosts

# Forward other queries to Google DNS
server=8.8.8.8
server=8.8.4.4
```

### Environment Variables

Create `.env.local` for development:

```bash
# .env.local

# ACME Configuration (Development)
ACME_SERVER_URL=https://pebble:14000/dir
ACME_SKIP_TLS_VERIFY=true
DOMAIN_SUFFIX=localtest.me

# Production uses:
# ACME_SERVER_URL=https://acme-v02.api.letsencrypt.org/directory
# ACME_ACCOUNT_KEY=<encrypted key from Pulumi>
# ACME_SKIP_TLS_VERIFY=false
# DOMAIN_SUFFIX=origan.app
```

### Control API Changes

#### New Environment Variables

```typescript
// packages/control-api/src/config.ts

export const config = {
  acme: {
    // ACME server URL (default: Let's Encrypt production)
    serverUrl: process.env.ACME_SERVER_URL ||
               "https://acme-v02.api.letsencrypt.org/directory",

    // ACME account key (required for production)
    accountKey: process.env.ACME_ACCOUNT_KEY || "",

    // Skip TLS verification (Pebble uses self-signed certs)
    skipTlsVerify: process.env.ACME_SKIP_TLS_VERIFY === "true",
  },

  domains: {
    // Domain suffix for user domains
    suffix: process.env.DOMAIN_SUFFIX || "origan.app",
  },
};
```

#### Enhanced ACME Client

```typescript
// packages/control-api/src/services/acme.service.ts

import acme from "acme-client";
import https from "https";
import { config } from "../config.js";

/**
 * Create ACME client with environment-specific configuration
 */
export function createAcmeClient() {
  const clientOptions: any = {
    directoryUrl: config.acme.serverUrl,
  };

  // For Pebble (local development), skip TLS verification
  if (config.acme.skipTlsVerify) {
    clientOptions.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  // If account key is provided, use it
  if (config.acme.accountKey) {
    clientOptions.accountKey = config.acme.accountKey;
  }

  return new acme.Client(clientOptions);
}

/**
 * Issue certificate for domain via HTTP-01 challenge
 */
export async function issueCertificate(domain: string) {
  const log = getLogger();
  const client = createAcmeClient();

  log.info(`Issuing certificate for domain: ${domain}`);

  try {
    // Create certificate signing request
    const [key, csr] = await acme.crypto.createCsr({
      commonName: domain,
    });

    // Submit order
    const cert = await client.auto({
      csr,
      email: "admin@origan.dev",
      termsOfServiceAgreed: true,
      challengeCreateFn: async (authz, challenge, keyAuthorization) => {
        // Store challenge for HTTP-01 validation
        log.info(
          `Challenge: ${challenge.type} for ${authz.identifier.value}`
        );
        log.info(`Key authorization: ${keyAuthorization}`);

        // Gateway should serve this at:
        // http://${domain}/.well-known/acme-challenge/${challenge.token}
        // Response: keyAuthorization

        // Store in Redis or database for gateway to retrieve
        await storeChallengeToken(challenge.token, keyAuthorization);
      },
      challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
        // Remove challenge after validation
        await removeChallengeToken(challenge.token);
      },
    });

    log.info(`Certificate issued successfully for ${domain}`);

    return {
      privateKey: key.toString(),
      certificate: cert.toString(),
    };
  } catch (error) {
    log.error(`Failed to issue certificate for ${domain}:`, error);
    throw error;
  }
}
```

#### Challenge Token Storage

```typescript
// packages/control-api/src/services/acme-challenge.service.ts

import { getRedisClient } from "../libs/redis.js";

const CHALLENGE_PREFIX = "acme:challenge:";
const CHALLENGE_TTL = 600; // 10 minutes

/**
 * Store ACME challenge token for HTTP-01 validation
 */
export async function storeChallengeToken(
  token: string,
  keyAuthorization: string
) {
  const redis = getRedisClient();
  const key = `${CHALLENGE_PREFIX}${token}`;
  await redis.setex(key, CHALLENGE_TTL, keyAuthorization);
}

/**
 * Get ACME challenge key authorization
 */
export async function getChallengeToken(token: string): Promise<string | null> {
  const redis = getRedisClient();
  const key = `${CHALLENGE_PREFIX}${token}`;
  return await redis.get(key);
}

/**
 * Remove ACME challenge token
 */
export async function removeChallengeToken(token: string) {
  const redis = getRedisClient();
  const key = `${CHALLENGE_PREFIX}${token}`;
  await redis.del(key);
}
```

### Gateway Changes

The gateway must serve ACME HTTP-01 challenges at:
```
http://<domain>/.well-known/acme-challenge/<token>
```

#### Add Challenge Endpoint

```typescript
// packages/gateway/src/routes/acme.ts

import { Router } from "express";
import { getChallengeToken } from "../services/acme-challenge.service.js";

export const acmeRouter = Router();

/**
 * Serve ACME HTTP-01 challenge
 * GET /.well-known/acme-challenge/:token
 */
acmeRouter.get("/.well-known/acme-challenge/:token", async (req, res) => {
  const { token } = req.params;

  const keyAuthorization = await getChallengeToken(token);

  if (!keyAuthorization) {
    return res.status(404).send("Challenge not found");
  }

  // Must return plain text
  res.type("text/plain").send(keyAuthorization);
});
```

#### Register Route

```typescript
// packages/gateway/src/index.ts

import { acmeRouter } from "./routes/acme.js";

// Register ACME challenge route BEFORE other routes
app.use(acmeRouter);
```

## Testing Flow

### 1. Start Local Environment

```bash
# Start all services including Pebble
docker-compose up -d

# Check Pebble is running
curl -k https://localhost:14000/dir
```

### 2. Create Project with Custom Domain

```bash
# Via admin UI or API
# Domain: myapp.localtest.me
```

### 3. Domain Issuance Flow

```
User requests domain: myapp.localtest.me
    ↓
Control API calls issueCertificate()
    ↓
ACME client (acme-client) contacts Pebble
    ↓
Pebble creates HTTP-01 challenge
    ↓
Control API stores challenge in Redis
    ↓
Pebble validates via HTTP request:
  http://myapp.localtest.me/.well-known/acme-challenge/<token>
    ↓
Gateway serves challenge from Redis
    ↓
Pebble validates response
    ↓
Pebble issues certificate
    ↓
Control API receives certificate
    ↓
Control API stores certificate in database
    ↓
Gateway loads certificate and serves HTTPS
```

### 4. Access Application

```bash
# Browser
https://myapp.localtest.me

# Note: Certificate will show as untrusted (Pebble CA not in browser trust store)
# Accept the warning or add Pebble's CA to your system trust store
```

### 5. Get Pebble CA Certificate (Optional)

```bash
# Download Pebble's root CA
curl -k https://localhost:15000/roots/0 > pebble-ca.pem

# Add to system trust store (macOS)
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain pebble-ca.pem

# Add to system trust store (Linux)
sudo cp pebble-ca.pem /usr/local/share/ca-certificates/pebble.crt
sudo update-ca-certificates
```

## Docker Network Considerations

### The Challenge: `localtest.me` Resolution Inside Docker

**Critical Issue:** When Pebble (running in Docker) validates `myapp.localtest.me`:

1. DNS lookup: `myapp.localtest.me` → `127.0.0.1` (via public DNS)
2. Pebble tries: `http://127.0.0.1:80/.well-known/acme-challenge/...`
3. ❌ **Problem:** `127.0.0.1` inside Pebble container = Pebble itself, NOT the gateway!
4. Validation fails

### Solution: Custom DNS with dnsmasq

Run a DNS server inside Docker that resolves `*.localtest.me` to the **gateway container's IP**:

```yaml
# docker-compose.yml

services:
  # DNS server for local domain resolution
  dnsmasq:
    image: jpillora/dnsmasq
    ports:
      - "53:53/udp"
    volumes:
      - ./docker/dnsmasq.conf:/etc/dnsmasq.conf
    networks:
      origan-network:
        ipv4_address: 172.20.0.2
    cap_add:
      - NET_ADMIN

  gateway:
    # ... existing config ...
    ports:
      - "80:80"      # Required for ACME HTTP-01
      - "443:443"
    networks:
      origan-network:
        ipv4_address: 172.20.0.10  # Static IP for DNS resolution

  pebble:
    image: letsencrypt/pebble:latest
    command: pebble -config /test/config/pebble-config.json
    ports:
      - "14000:14000"
      - "15000:15000"
    environment:
      PEBBLE_VA_NOSLEEP: 1
    dns:
      - 172.20.0.2  # Point to dnsmasq container
      - 8.8.8.8     # Fallback to Google DNS
    networks:
      origan-network:
        ipv4_address: 172.20.0.3
    depends_on:
      - dnsmasq
      - gateway

  control-api:
    # ... existing config ...
    networks:
      origan-network:
        ipv4_address: 172.20.0.11
    depends_on:
      - gateway
      - pebble

networks:
  origan-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
```

### dnsmasq Configuration

Create `docker/dnsmasq.conf`:

```conf
# Resolve all *.localtest.me to gateway container
address=/localtest.me/172.20.0.10

# Log queries for debugging
log-queries

# Don't read /etc/hosts
no-hosts

# Forward other queries to Google DNS
server=8.8.8.8
server=8.8.4.4
```

### How It Works

```
Pebble validates myapp.localtest.me:
    ↓
DNS query to dnsmasq (172.20.0.2)
    ↓
dnsmasq returns: 172.20.0.10 (gateway container IP)
    ↓
Pebble connects: http://172.20.0.10:80/.well-known/acme-challenge/...
    ↓
Gateway serves challenge
    ↓
✅ Validation succeeds!
```

### Host Machine Browser Access

Your browser (on host) still needs to resolve `*.localtest.me`:

**Option 1: Use public DNS (Recommended)**
- `localtest.me` already resolves to `127.0.0.1` via public DNS
- Gateway publishes port 80/443 to host
- Browser connects to `http://myapp.localtest.me:80` → `127.0.0.1:80` → gateway ✅

**Option 2: Use host's dnsmasq**
```bash
# macOS - configure dnsmasq to use Docker's DNS server
echo "server=/localtest.me/127.0.0.1#53" > /usr/local/etc/dnsmasq.d/localtest.conf
sudo brew services restart dnsmasq
```

**Recommended:** Use Option 1 (public DNS) for simplicity.

## Configuration Summary

### Development Mode
```bash
# .env.local
ACME_SERVER_URL=https://pebble:14000/dir
ACME_SKIP_TLS_VERIFY=true
ACME_ACCOUNT_KEY=  # Empty for Pebble
DOMAIN_SUFFIX=localtest.me
```

### Staging Mode (CI/Testing)
```bash
# .env.staging
ACME_SERVER_URL=https://acme-staging-v02.api.letsencrypt.org/directory
ACME_SKIP_TLS_VERIFY=false
ACME_ACCOUNT_KEY=<staging-account-key>
DOMAIN_SUFFIX=staging.origan.app
```

### Production Mode
```bash
# From Pulumi secrets
ACME_SERVER_URL=https://acme-v02.api.letsencrypt.org/directory
ACME_SKIP_TLS_VERIFY=false
ACME_ACCOUNT_KEY=<production-account-key-from-pulumi>
DOMAIN_SUFFIX=origan.app
```

## Alternative: Skip Validation Entirely

For rapid development, completely skip ACME validation:

```yaml
# docker-compose.yml
pebble:
  environment:
    PEBBLE_VA_ALWAYS_VALID: 1  # Always succeed validation
```

This allows testing the certificate issuance API without configuring HTTP-01 challenges.

**Pros:**
- Simplest setup
- No networking configuration needed
- Fast iteration

**Cons:**
- Doesn't test actual HTTP-01 challenge flow
- Doesn't catch validation bugs

**Recommendation:** Start with `PEBBLE_VA_ALWAYS_VALID=1`, then disable it once basic flow works.

## Testing Checklist

### Basic Flow
- [ ] Start docker-compose with Pebble
- [ ] Access Pebble directory: `curl -k https://localhost:14000/dir`
- [ ] Request domain via admin UI: `myapp.localtest.me`
- [ ] Verify certificate issued (check database)
- [ ] Access domain in browser: `https://myapp.localtest.me`
- [ ] Accept browser warning (untrusted Pebble CA)
- [ ] Verify application loads

### Challenge Validation
- [ ] Set `PEBBLE_VA_ALWAYS_VALID=0`
- [ ] Request domain: `test.localtest.me`
- [ ] Verify gateway serves challenge: `curl http://test.localtest.me/.well-known/acme-challenge/<token>`
- [ ] Verify Pebble validates challenge (check logs)
- [ ] Verify certificate issued

### Error Handling
- [ ] Request invalid domain (should fail)
- [ ] Request domain with gateway down (should fail)
- [ ] Request domain with Redis down (should fail)
- [ ] Verify error messages logged

### Cleanup
- [ ] Stop docker-compose
- [ ] Restart docker-compose
- [ ] Verify certificates persisted (stored in database)

## Security Considerations

1. **Pebble in Production:** Never use Pebble in production (only for development/testing)
2. **Skip TLS Verify:** Only enable in development with Pebble
3. **Certificate Trust:** Pebble certificates are not trusted by browsers (expected in dev)
4. **Challenge Tokens:** Expire after 10 minutes (TTL)
5. **Redis Security:** Ensure Redis is not exposed publicly

## Documentation Updates

### Developer Guide

```markdown
# Local Domain Testing

To test custom domains locally:

1. Start services with Pebble ACME server:
   ```bash
   docker-compose up -d
   ```

2. Use `localtest.me` domains:
   - `myapp.localtest.me` → Resolves to `127.0.0.1`
   - Works in browser and Docker containers

3. Request a domain in admin UI:
   - Enter domain: `myapp.localtest.me`
   - Certificate will be issued by Pebble

4. Access your domain:
   ```bash
   https://myapp.localtest.me
   ```

   Note: Browser will show security warning (Pebble CA not trusted)
   Accept the warning to proceed.

5. (Optional) Trust Pebble CA:
   ```bash
   curl -k https://localhost:15000/roots/0 > pebble-ca.pem
   # Add to system trust store
   ```
```

## Future Enhancements

### DNS-01 Challenge Support
- Use `pebble-challtestsrv` for DNS-01 challenges
- Useful for wildcard certificates: `*.localtest.me`

### CI/CD Integration
- Run Pebble in GitHub Actions for E2E tests
- Verify domain issuance in CI pipeline

### Certificate Rotation Testing
- Test certificate renewal flow
- Test certificate expiry handling

### Multi-Domain Testing
- Test multiple domains per project
- Test domain deletion and cleanup

## Open Questions

1. **Should we commit `.env.local` to repo?**
   - Proposal: Yes, with development defaults (no secrets)

2. **Should Pebble be part of default docker-compose or separate profile?**
   - Proposal: Separate `docker-compose.dev.yml` for development tools
   - Usage: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up`

3. **Should we add UI toggle for "Skip ACME validation" in development?**
   - Proposal: Add to admin UI settings (dev mode only)

4. **Should we cache Pebble CA certificate in repo?**
   - Proposal: Yes, in `docker/certs/pebble-ca.pem` for convenience

5. **Should gateway automatically trust Pebble CA in dev mode?**
   - Proposal: Yes, mount Pebble CA into gateway container

## Appendix

### Pebble Configuration

Pebble uses default configuration from `/test/config/pebble-config.json`:

```json
{
  "pebble": {
    "listenAddress": "0.0.0.0:14000",
    "managementListenAddress": "0.0.0.0:15000",
    "certificate": "test/certs/localhost/cert.pem",
    "privateKey": "test/certs/localhost/key.pem",
    "httpPort": 5002,
    "tlsPort": 5001,
    "ocspResponderURL": "",
    "externalAccountBindingRequired": false
  }
}
```

### Pebble Management API

```bash
# Get root certificates
curl -k https://localhost:15000/roots/0

# Get intermediate certificates
curl -k https://localhost:15000/intermediates/0

# Clear all certificates (reset state)
curl -k -X POST https://localhost:15000/reset
```

### Useful Commands

```bash
# Check Pebble logs
docker logs -f origan-pebble-1

# Check gateway logs for challenge requests
docker logs -f origan-gateway-1 | grep acme-challenge

# Manually test challenge endpoint
curl http://myapp.localtest.me/.well-known/acme-challenge/test-token

# Test certificate with openssl
echo | openssl s_client -connect myapp.localtest.me:443 -servername myapp.localtest.me 2>/dev/null | openssl x509 -noout -text
```

---

**End of RFC**
