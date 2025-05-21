# Control API

The Control API is the central backend service of the Origan platform, managing project configurations, deployments, authentication, and database operations.

## Features

- Project management
- Build and deployment orchestration
- GitHub integration
- Authentication and authorization
- Database operations using Drizzle ORM
- NATS event handling
- S3 object storage integration

## Tech Stack

- Elysia (Bun web framework)
- Drizzle ORM
- NATS messaging
- PostgreSQL
- AWS S3

## Development

1. Environment Setup:
```bash
# Copy example env file
cp .env.example .env

# Install dependencies
pnpm install
```

2. Database Setup:
```bash
# Run database migrations
pnpm db:migrate

# Generate types from schema
pnpm db:generate
```

3. Start Development Server:
```bash
pnpm dev
```

## API Routes

### Authentication
- `POST /auth/login`: User authentication
- `POST /auth/register`: User registration
- `POST /auth/refresh`: Token refresh

### Projects
- `GET /projects`: List projects
- `POST /projects`: Create project
- `GET /projects/:id`: Get project details
- `PUT /projects/:id`: Update project
- `DELETE /projects/:id`: Delete project

### Builds
- `POST /builds`: Create build
- `GET /builds/:id`: Get build status
- `GET /builds/:id/logs`: Get build logs

### Deployments
- `GET /deployments`: List deployments
- `POST /deployments`: Create deployment
- `GET /deployments/:id`: Get deployment status

### GitHub Integration
- `POST /github/webhook`: GitHub webhook handler
- `GET /github/repos`: List user repositories
- `POST /github/install`: Install GitHub app

## Configuration

Key environment variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/origan

# GitHub
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY=path-to-private-key
GITHUB_WEBHOOK_SECRET=webhook-secret

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h

# NATS
EVENTS_NATS_SERVER=nats://localhost:4222
EVENTS_NATS_NKEY_CREDS=optional-credentials

# S3
S3_BUCKET=your-bucket-name
S3_REGION=your-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Database Migrations

Create a new migration:
```bash
pnpm db:generate:migration my_migration_name
```

Run migrations:
```bash
pnpm db:migrate
```

## Error Handling

The API uses standard HTTP status codes:

- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

Error response format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Testing

Run tests:
```bash
pnpm test
```

Run with coverage:
```bash
pnpm test:coverage
```

## Production Deployment

Build for production:
```bash
pnpm build
```

Start production server:
```bash
pnpm start
```

For containerized deployment:
```bash
docker build -t origan-control-api .
docker run -p 3000:3000 origan-control-api