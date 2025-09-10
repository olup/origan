# Builder

The Builder is responsible for executing builds for projects in the Origan platform.

## Configuration

The Builder is configured using environment variables by its parent process.

### Required Environment Variables

- `BUILD_ID`: UUID of the build (required)
- `GITHUB_TOKEN`: GitHub token for accessing repositories
- `REPO_FULL_NAME`: Full name of the repository (username/repo)
- `COMMIT_SHA`: Git commit SHA to build
- `BRANCH`: Git branch name

### NATS Configuration

- `EVENTS_NATS_SERVER`: URL of the NATS server
- `EVENTS_NATS_NKEY_CREDS`: (Optional) NATS credentials
