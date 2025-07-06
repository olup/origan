# @origan/cli

Origan CLI tool for managing your applications.

Origan can let you deploy your fullstack application in seconds without any infrastructure - it just works. Think vercel, netlify or cloudflare pages, but european.

To deploy a project, origan cli expects a directory where to find your front end assets (on a classic SPA project it's often the `dist` folder once built) and optionally a directory where to find your backend code (we recommend an `api`folder). Origan will then deploy your project and give you a URL to access it.

Sample project structure:
```
my-project/
├── package.json     
├── origan.jsonc      # Origan configuration file (origan init to create it)
├── api/              # Optional: Backend code
│   └── hello.ts      # Example backend function callable at /api/hello
└── src/              # Frontend code
    ├── main.ts
    └── ...
```

## Installation

```bash
npm install -g @origan/cli
# or
yarn global add @origan/cli
# or
pnpm add -g @origan/cli
```

## Usage

```bash
origan [command] [options]
```

## Available Commands

### `origan login`

Log in to your Origan account.

```bash
origan login
```

### `origan init`

Initialize Origan configuration in your project, will create the `origan.jsonc` file.

```bash
origan init
```

### `origan deploy`

Deploy your application.

```bash
origan deploy [options]

Options:
  -b, --branch <name>  Branch name to deploy (default: "main")
  -t, --track <name>   Track name for the deployment (optional)
```

### `origan dev`

Start the development environment.

```bash
origan dev
```

### `origan logout`

Log out from your Origan account.

```bash
origan logout
```



## Example Usage

1. Log in to your account:
```bash
origan login
```

2. Initialize a new project:
```bash
origan init
```

1. Deploy your application, optionally tagging the deployment with a branch name
```bash
origan deploy --branch main
```