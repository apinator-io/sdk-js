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

Use the SDK directly in the browser via a CDN. The script-tag build defines a global `Apinator`:

```html
<script src="https://cdn.jsdelivr.net/npm/@apinator/client@2.3.0/dist/apinator.min.js"></script>
<script>
  const client = new Apinator({ appKey: 'your-app-key', cluster: 'eu' }).connect();
</script>
```

Or import the ES module build:

```html
<script type="module">
  import { Apinator } from 'https://cdn.jsdelivr.net/npm/@apinator/client@2.3.0/dist/index.mjs';
</script>
```

Both work on unpkg too (`https://unpkg.com/@apinator/client@2.3.0/dist/…`). Pin the version so a release can't change your page.

## Module Formats

The SDK ships dual ESM + CommonJS builds:

| File | Format | Use Case |
|------|--------|----------|
| `dist/index.mjs` | ESM | Modern bundlers, `<script type="module">` |
| `dist/index.js` | CommonJS | Node.js, legacy bundlers |
| `dist/apinator.min.js` | IIFE, minified | `<script src>`; defines the global `Apinator` |
| `dist/index.d.ts` | TypeScript declarations | Type checking |

## Requirements

- Any modern browser with WebSocket and `fetch` support
- No runtime dependencies. In Node 22+ the global `WebSocket` is used; on older Node install `ws` and pass it as the `WebSocket` option
- For server-side event publishing, use [`@apinator/server`](https://www.npmjs.com/package/@apinator/server)
