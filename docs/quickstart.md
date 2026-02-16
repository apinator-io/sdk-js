# Quick Start

Get real-time events flowing in 5 steps.

## 1. Install

```bash
npm install @apinator/client
```

## 2. Connect

```typescript
import { RealtimeClient } from '@apinator/client';

const client = new RealtimeClient({
  appKey: 'your-app-key',
  cluster: 'eu', // or 'us'
});

client.connect();
```

## 3. Subscribe to a Channel

```typescript
const channel = client.subscribe('notifications');
```

## 4. Bind to Events

```typescript
channel.bind('new-message', (data) => {
  console.log('New message:', data);
});
```

## 5. Done!

Events published from your server (via the server SDK) will now arrive in real time.

---

## Next Steps

- **Private channels** — authenticate subscriptions via your backend. See [API Reference](api-reference.md#private-channels).
- **Presence channels** — track who's online. See [API Reference](api-reference.md#presencechannel).
- **Client events** — send events directly between clients on private/presence channels.

## Triggering Events from the Server

Use the [Node.js server SDK](https://www.npmjs.com/package/@apinator/server) to publish events:

```typescript
import { RealtimeClient } from '@apinator/server';

const client = new RealtimeClient({
  appId: 'your-app-id',
  key: 'your-app-key',
  secret: 'your-app-secret',
  cluster: 'eu',
});

await client.trigger('notifications', 'new-message', {
  text: 'Hello from the server!',
});
```
