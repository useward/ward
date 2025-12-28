# ward

Next.js instrumentation SDK for full-stack observability.

## Installation

```bash
npm install @useward/instrumentation
```

## Setup

### 1. Server-side instrumentation

Create `instrumentation.ts` in your project root:

```ts
export async function register() {
  if (process.env.NODE_ENV === 'development') {
    const { registerWard } = await import('@useward/instrumentation');
    registerWard();
  }
}
```

### 2. Client-side instrumentation

Create `instrumentation-client.ts` in your project root:

```ts
export async function register() {
  if (process.env.NODE_ENV === 'development') {
    const { registerWard } = await import('@useward/instrumentation/client');
    registerWard();
  }
}
```

### 3. Middleware (optional)

For trace context propagation across requests:

```ts
// middleware.ts
import { withWard } from '@useward/instrumentation/middleware';

export const middleware = withWard();
```

## Configuration

Ward auto-detects your project and sends telemetry to the local devtools server.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WARD_PROJECT_ID` | Auto-detected | Project identifier |
| `WARD_ENDPOINT` | `http://localhost:19393` | Devtools server URL |
| `WARD_DEBUG` | `false` | Enable debug logging |

## What Gets Traced

### Server-Side
- React Server Component renders
- Server Actions execution
- API route handlers
- Database queries (via fetch instrumentation)
- External HTTP requests

### Client-Side
- Page navigations
- Hydration timing
- Client-side fetches
- Web Vitals (FCP, LCP)
- Long tasks

## Exports

| Export | Description |
|--------|-------------|
| `@useward/instrumentation` | Main entry |
| `@useward/instrumentation` | Server-side instrumentation |
| `@useward/instrumentation/client` | Client-side instrumentation |
| `@useward/instrumentation/middleware` | Next.js middleware utilities |
| `@useward/instrumentation/session-meta` | Session metadata component |

## Requirements

- Next.js 15+
- React 18+

## License

[FSL-1.1-Apache-2.0](../../LICENSE)
