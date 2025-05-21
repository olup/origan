# Origan Admin Panel

The administration interface for the Origan platform, built with React and Vite, providing a comprehensive dashboard for managing projects, deployments, and platform settings.

## Features

- Project management dashboard
- Deployment monitoring
- User authentication and authorization
- GitHub repository integration
- Build logs viewer
- System configuration
- Real-time status updates

## Tech Stack

- React 18+
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Hono Query for API integration

## Development

1. Environment Setup:
```bash
# Copy example env file
cp .env.example .env

# Install dependencies
pnpm install
```

2. Start Development Server:
```bash
pnpm dev
```

Access the admin panel at [http://localhost:5173](http://localhost:5173)

## Project Structure

```
admin-panel/
├── src/
│   ├── hooks/      # Custom React hooks
│   ├── libs/       # Utility libraries
│   ├── pages/      # Route components
│   └── utils/      # Helper functions
└── public/         # Static assets
```

## Authentication

The admin panel uses JWT-based authentication:

1. User logs in via GitHub
2. Receives JWT token
3. Token stored in secure storage
4. Token included in API requests

## API Integration

API calls are handled through the Hono Query client:

```typescript
import { useProjects } from '@/hooks/useProjects'

function ProjectList() {
  const { data, isLoading } = useProjects()
  // ...
}
```

## Building

Create production build:
```bash
pnpm build
```

Preview production build:
```bash
pnpm preview
```

## Type Safety

The project uses TypeScript for type safety. Run type checks:

```bash
pnpm typecheck
```

## Testing

Run tests:
```bash
pnpm test
```

Run with coverage:
```bash
pnpm coverage
```

## Deployment

The admin panel is automatically deployed through our CI/CD pipeline:

1. Push changes to main branch
2. CI builds the application
3. Deploy to production environment

## Adding New Features

1. Create new component:
```typescript
// src/pages/NewFeature.tsx
export function NewFeature() {
  return (
    <div>
      <h1>New Feature</h1>
    </div>
  )
}
```

2. Add route in router configuration
3. Implement required API integration
4. Add tests

## State Management

State is managed through React hooks and context:

- Authentication state
- Project data
- User preferences
- Real-time updates

## Error Handling

The application implements comprehensive error handling:

- API error boundaries
- Form validation
- Network error recovery
- User feedback
