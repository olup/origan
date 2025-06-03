# NATS Client Library

The NATS client library provides a TypeScript implementation for NATS messaging in the Origan platform. It handles communication between various platform components using the NATS messaging system.

## Features

- Strongly typed NATS client implementation
- Connection management with automatic reconnection
- Publisher for sending messages
- Subscriber for receiving messages
- Type-safe subject handling
- Integration with Origan platform services

## Usage

### Basic Setup

```typescript
import { NatsClient } from '@origan/nats'

const client = new NatsClient({
  server: 'nats://localhost:4222',
  nkeyCreds: 'optional-nkey-credentials'
})

await client.connect()
```

### Publishing Messages

```typescript
import { Publisher } from '@origan/nats'

const publisher = new Publisher(client)
await publisher.publish('subject.name', { data: 'payload' })
```

### Subscribing to Messages

```typescript
import { Subscriber } from '@origan/nats'

const subscriber = new Subscriber(client)
await subscriber.subscribe('subject.name', (msg) => {
  console.log('Received:', msg.data)
})
```

## Configuration

Configure the NATS client using environment variables:

- `EVENTS_NATS_SERVER`: URL of the NATS server
- `EVENTS_NATS_NKEY_CREDS`: (Optional) NATS NKey credentials

## Integration

This library is used by several Origan platform components:

- Build Runner: For build event notifications
- Control API: For deployment status updates
- Gateway: For configuration updates

## Development

1. Install dependencies:
```bash
pnpm install
```

2. Run tests:
```bash
pnpm test
```

## Type Definitions

The library provides TypeScript definitions for:
- Connection management
- Message publishing
- Message subscription
- Subject patterns
- Event payloads