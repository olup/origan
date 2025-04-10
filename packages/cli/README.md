# @origan/cli

Origan CLI tool for managing your applications.

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