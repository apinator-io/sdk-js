# Installation

## Package Managers

### npm
```bash
npm install @apinator/client
```

### yarn
```bash
yarn add @apinator/client
```

### pnpm
```bash
pnpm add @apinator/client
```

## CDN

Use the SDK directly in the browser via a CDN:

```html
<!-- ES Module -->
<script type="module">
  import { RealtimeClient } from 'https://cdn.jsdelivr.net/npm/@apinator/client/dist/index.mjs';
</script>

<!-- unpkg alternative -->
<script type="module">
  import { RealtimeClient } from 'https://unpkg.com/@apinator/client/dist/index.mjs';
</script>
```

## Module Formats

The SDK ships dual ESM + CommonJS builds:

| File | Format | Use Case |
|------|--------|----------|
| `dist/index.mjs` | ESM | Modern bundlers, `<script type="module">` |
| `dist/index.js` | CommonJS | Node.js, legacy bundlers |
| `dist/index.d.ts` | TypeScript declarations | Type checking |

## Requirements

- Any modern browser with WebSocket and `fetch` support
- No Node.js runtime dependencies — this is a browser-only SDK
- For server-side event publishing, use [`@apinator/server`](https://www.npmjs.com/package/@apinator/server)
