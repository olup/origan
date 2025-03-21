# Origan Pulumi Deployment - Development Guide

## Commands
- **Build**: `pulumi up` - Deploy infrastructure changes
- **Preview**: `pulumi preview` - Preview infrastructure changes without deploying
- **Lint**: `tsc --noEmit` - Type check without emitting files
- **Test**: `pulumi preview --stack [stack-name]` - Test against specific stack
- **Destroy**: `pulumi destroy` - Destroy all deployed resources
- **Select Stack**: `pulumi stack select [stack-name]` - Switch between stacks

## Code Style Guidelines
- **Formatting**: Use 2-space indentation with semicolons
- **Typing**: Enable strict TypeScript, use explicit types for function parameters and returns
- **Naming**: 
  - Use camelCase for variables and functions
  - Use PascalCase for classes and interfaces
  - Prefix resource names with project name for clarity
- **Imports**: Group imports by external packages, then internal modules
- **Error Handling**: Use try/catch blocks for error handling when working with external resources
- **Comments**: Document complex functions with clear descriptions of purpose and parameters
- **Resource Naming**: Use consistent naming pattern for Pulumi resources with the format `[projectName]-[resourceType]-[purpose]`
- **Configuration**: Store environment-specific values in Pulumi.[stack].yaml files