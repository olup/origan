# Origan Landing Page

The landing page for Origan platform, built with Next.js, showcasing our features and providing documentation.

## Features

- Modern, responsive design
- Platform feature showcase
- Documentation sections
- Interactive examples
- SEO optimization

## Tech Stack

- Next.js 14+ with App Router
- TypeScript
- Panda CSS for styling
- Geist font
- Static site generation

## Development

1. Install dependencies:
```bash
pnpm install
```

2. Start development server:
```bash
pnpm dev
```

Access the site at [http://localhost:3000](http://localhost:3000)

## Project Structure

```
landing/
├── public/          # Static assets
├── src/
│   ├── app/        # App router pages
│   ├── components/ # React components
│   ├── styles/     # Global styles
│   └── utils/      # Utility functions
└── content/        # Page content
```

## Content Management

Page content is managed through Markdown files in the `content` directory. To update content:

1. Locate the relevant `.md` file
2. Edit content using Markdown
3. Commit changes
4. Content updates automatically on build

## Styling

This project uses Panda CSS for styling:

- Modify styles in `panda.config.ts`
- Use utility classes in components
- Create custom patterns as needed

## Building

Build for production:
```bash
pnpm build
```

Preview production build:
```bash
pnpm start
```

## Deployment

The site is automatically deployed through our CI/CD pipeline:

1. Push changes to main branch
2. CI builds the site
3. Site deploys to production

## Adding New Pages

1. Create new page in `src/app`:
```typescript
// src/app/new-page/page.tsx
export default function NewPage() {
  return (
    <main>
      <h1>New Page</h1>
    </main>
  )
}
```

2. Add content in `content/new-page.md`
3. Update navigation if needed

## SEO

Each page should include proper metadata:

```typescript
export const metadata = {
  title: 'Page Title | Origan',
  description: 'Page description for search engines'
}
```

## Testing

Run tests:
```bash
pnpm test
```

Run linter:
```bash
pnpm lint
