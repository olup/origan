# Function Logs Architecture

## Overview

This document describes the architecture for capturing, transmitting, and displaying logs from deployed functions in the Origan platform.

## Log Flow

### 1. Log Capture (Runner)

Functions executed in the EdgeRuntime workers have their console output captured through the `globalThis.EventManager` (SupabaseEventListener). The event-worker process monitors these events and processes log-type events.

**Location**: `packages/runner/functions/event-worker/index.ts`

### 2. Log Publishing

Logs are published to NATS JetStream with the following structure:

#### Topic Format
```
logs.${projectId}.${deploymentId}.${functionPathHash}
```

- `projectId`: The project identifier
- `deploymentId`: The deployment identifier  
- `functionPathHash`: SHA-1 hash of the function path for unique identification

#### Message Format
```typescript
{
  timestamp: string;
  msg: string;
  level: "Error" | "Warning" | "Info" | "Debug";
  functionPath: string;  // Clear text path (e.g., "api/users/create.ts")
}
```

### 3. Log Subscription (Control API)

The control API provides a streaming tRPC endpoint that subscribes to deployment logs:

**Endpoint**: `logs.stream`
- Subscribes to NATS topic pattern: `logs.${projectId}.${deploymentId}.*`
- Streams logs to clients via tRPC subscription
- Supports filtering by function path on the client side

### 4. Log Display (Admin UI)

The admin interface displays logs in the deployment details page with the following structure:

#### Page Organization
- **Sub-navigation**: Tabs for "Build" and "Logs" sections
  - Uses real nested routes (e.g., `/deployments/:id/build` and `/deployments/:id/logs`)
  - Tab navigation updates the URL for deep linking and browser history
- **Build Section**: Shows build process logs and deployment status
- **Logs Section**: 
  - "Start Listening" button to initiate log streaming
  - Real-time log display with color-coded levels
  - Function path display for each log entry
  - Auto-scroll functionality with pause on manual scroll

## Implementation Details

### NATS Topic Structure

The hierarchical topic structure enables flexible subscription patterns:

- `logs.>` - All logs from all projects
- `logs.${projectId}.>` - All logs from a specific project
- `logs.${projectId}.${deploymentId}.>` - All logs from a deployment
- `logs.${projectId}.${deploymentId}.${functionHash}` - Logs from specific function

### Log Levels

Logs are categorized into four levels with corresponding UI colors:
- **Error** (red): Critical errors and exceptions
- **Warning** (orange): Warning messages
- **Info** (white): Informational messages
- **Debug** (gray): Debug output

### Streaming Protocol

The system uses tRPC subscriptions for real-time log streaming:
1. Client initiates subscription to deployment logs
2. Server subscribes to NATS topic pattern
3. Logs are streamed as they arrive
4. Connection remains open until explicitly closed by client

### Performance Considerations

- **Buffering**: Logs are streamed with minimal buffering to ensure real-time visibility
- **Auto-scroll**: Smart auto-scroll that pauses when user manually scrolls
- **Connection Management**: Automatic cleanup of NATS subscriptions on disconnect
- **Topic Filtering**: NATS wildcard subscriptions reduce overhead

## Future Enhancements

1. **Log Persistence**: Store logs in database for historical viewing
2. **Advanced Filtering**: Client-side filtering by log level, function path, time range
3. **Log Export**: Download logs in various formats (JSON, CSV, plain text)
4. **Log Aggregation**: Metrics and insights from log patterns
5. **Alert Rules**: Notifications based on log patterns or error rates