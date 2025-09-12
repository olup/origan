# API Deployment Architecture

## Overview

Origan supports serverless API functions alongside static content deployment. API routes are automatically detected, bundled, and deployed to execute in an isolated Edge Runtime environment.

## File Structure

API routes follow a file-based routing convention. Place your API functions in the `/api` directory at the root of your project:

```
project/
├── api/
│   ├── hello.js         # → /api/hello
│   ├── users/
│   │   ├── index.js      # → /api/users
│   │   └── [id].js       # → /api/users/[id] (dynamic route)
│   └── webhook.ts        # → /api/webhook
├── dist/                 # Static build output
│   └── index.html
└── origan.config.json
```

## Supported File Types

API routes can be written in:
- JavaScript (`.js`, `.mjs`)
- TypeScript (`.ts`, `.tsx`, `.jsx`)

Files with `.test.` or `.spec.` in their names are automatically excluded.

## API Function Format

Each API file should export a default async function that handles the HTTP request:

```javascript
// api/hello.js
export default async function handler(request) {
  // Access request data
  const { method, headers, url } = request;
  
  // Parse JSON body if needed
  const body = await request.json();
  
  // Return Response object
  return new Response(JSON.stringify({ message: "Hello World" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
```

## Build Process

During the build phase, the builder:

1. **Detection**: Scans the `/api` directory for valid route files
2. **Bundling**: Each route is bundled independently using esbuild with:
   - Tree-shaking for optimal size
   - ES modules format
   - Node.js 18 target compatibility
   - Minification enabled
3. **Packaging**: Bundled routes are added to the deployment archive under `/api/`

## Deployment Flow

1. **Builder Stage**:
   - Detects API routes in `/api` directory
   - Bundles each route with esbuild
   - Creates deployment config with route mappings
   - Uploads bundled functions to S3 bucket

2. **Control API Stage**:
   - Stores deployment configuration
   - Updates domain mappings
   - Manages environment variables

3. **Gateway Stage**:
   - Intercepts requests to `/api/*` paths
   - Adds deployment metadata headers
   - Forwards requests to the Runner service

4. **Runner Stage**:
   - Fetches function code from S3
   - Loads environment variables from metadata
   - Executes in Deno-based Edge Runtime
   - Returns response to Gateway

## Environment Variables

Environment variables configured for a track are automatically available in API functions:

```javascript
export default async function handler(request) {
  const apiKey = Deno.env.get("API_KEY");
  // Use environment variable
}
```

## Runtime Environment

API functions execute in a Deno-based Edge Runtime with:
- Web standard APIs (fetch, Request, Response, etc.)
- Limited file system access
- Isolated execution per request
- Automatic scaling

## Route Matching

Routes are matched based on file paths:
- `api/hello.js` → `/api/hello`
- `api/users/index.js` → `/api/users`
- `api/users/list.js` → `/api/users/list`

Directory index files (`index.js`) map to the directory path without `/index`.

## Example API Function

```typescript
// api/users.ts
interface User {
  id: string;
  name: string;
}

export default async function handler(request: Request): Promise<Response> {
  const { method } = request;
  
  switch (method) {
    case "GET":
      // Fetch users from database
      const users: User[] = await fetchUsers();
      return new Response(JSON.stringify(users), {
        headers: { "Content-Type": "application/json" },
      });
      
    case "POST":
      // Create new user
      const data = await request.json();
      const newUser = await createUser(data);
      return new Response(JSON.stringify(newUser), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
      
    default:
      return new Response("Method not allowed", { status: 405 });
  }
}
```

## Limitations

- Maximum function size: 10MB (after bundling)
- Execution timeout: 30 seconds
- Memory limit: 128MB per invocation
- No native Node.js modules (use Web APIs instead)

## Testing API Routes Locally

To test API routes before deployment:

1. Use the Origan CLI dev server (when available)
2. Or use any local server that can serve your functions

## Debugging

API function logs are available through:
- Build logs during deployment
- Runtime logs in the Runner service
- Control API deployment status

## Best Practices

1. **Keep functions small**: Each route is bundled separately
2. **Use environment variables**: For secrets and configuration
3. **Handle errors gracefully**: Return appropriate HTTP status codes
4. **Validate input**: Check request data before processing
5. **Use TypeScript**: For better type safety and IDE support
6. **Avoid large dependencies**: They increase bundle size
7. **Cache when possible**: Use appropriate cache headers

## Migration from Other Platforms

### From Vercel
- Move files from `/api` to `/api` (same structure)
- Update imports to use Web APIs instead of Node.js APIs
- Environment variables work the same way

### From Netlify Functions
- Move from `/.netlify/functions/` to `/api/`
- Convert from `exports.handler` to `export default`
- Update to use Request/Response objects

## Troubleshooting

### Function not found
- Verify file is in `/api` directory
- Check file extension is supported
- Ensure file exports default function

### Build errors
- Check for syntax errors in function code
- Verify all imports are available
- Review build logs for bundling issues

### Runtime errors
- Check Runner logs for execution errors
- Verify environment variables are set
- Ensure Response object is returned