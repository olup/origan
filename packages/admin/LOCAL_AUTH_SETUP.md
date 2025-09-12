# Local Development with Production API

This guide explains how to set up your local admin development environment to work with the production API, handling authentication and cookie issues.

## The Problem

When developing locally, you may encounter authentication issues when trying to use the production API:
- **Cross-origin cookies**: Browsers block cookies from different domains
- **Secure cookie flags**: Production cookies have `Secure` flag which doesn't work on localhost
- **SameSite restrictions**: Prevents cookies from being sent cross-origin

## The Solution

We use Vite's proxy feature to route API requests through your local dev server, which:
1. Forwards requests to the production API
2. Modifies cookie headers to work with localhost
3. Maintains session state properly

## Setup Instructions

### 1. Environment Configuration

The `.env.development` file is already configured:
```env
VITE_APP_ENV=development
VITE_API_URL=https://api.origan.dev
VITE_USE_PROXY=true
```

### 2. Start the Dev Server

```bash
cd packages/admin
pnpm dev
```

### 3. How It Works

- All API requests to `/api/*` are proxied to `https://api.origan.dev/*`
- Cookies are modified to work with localhost:
  - `Domain` restriction removed
  - `Secure` flag removed (for http://localhost)
  - `SameSite` set to `Lax`

### 4. Login Flow

1. Navigate to http://localhost:5199
2. Click login - you'll be redirected to GitHub OAuth
3. After authorization, you'll be redirected back to the production API
4. The production API will redirect you to the production admin URL (https://admin.origan.dev)
5. **Important**: Copy the `refreshToken` cookie value:
   - Open DevTools (F12)
   - Go to Application > Cookies > https://admin.origan.dev
   - Find the `refreshToken` cookie and copy its value
6. Set the cookie in your local environment:
   - Go back to http://localhost:5199
   - Open DevTools > Application > Cookies > http://localhost:5199
   - Create a new cookie:
     - Name: `refreshToken`
     - Value: (paste the token you copied)
     - Domain: `localhost`
     - Path: `/`
7. Refresh the page - you should now be authenticated!

### Alternative: Using Local API

If you prefer to use a local API instance:

1. Update `.env.development`:
```env
VITE_APP_ENV=development
VITE_API_URL=http://localhost:9999
VITE_USE_PROXY=false
```

2. Start your local control-api:
```bash
cd packages/control-api
pnpm dev
```

3. Make sure your local API has the correct environment variables set up

## Troubleshooting

### Cookies Not Being Set
- Check browser DevTools > Application > Cookies
- Ensure you're accessing via http://localhost:5199 (not 127.0.0.1)
- Make sure the cookie has:
  - Domain: `localhost` (not `.localhost` with a dot)
  - Path: `/`
  - HttpOnly: Yes (optional, but recommended)
- Clear existing cookies and try again

### 401 Unauthorized Errors
- The refresh token might be expired
- Clear cookies and login again through the production site
- Check console for token refresh errors
- Make sure you copied the entire token value (they're quite long)

### Proxy Not Working
- Verify `VITE_USE_PROXY=true` in `.env.development`
- Restart the dev server after changing environment variables
- Check the terminal for proxy logs

## Benefits

- Use production data while developing
- No need to set up local database
- Test against real API behavior
- Faster development cycle

## Security Notes

- This setup is for **development only**
- Never use proxy configuration in production
- Keep your `.env.development` file local (it's gitignored)