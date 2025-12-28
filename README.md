# Ward

Next.js-native observability for the modern stack. Full-stack telemetry with OpenTelemetry, designed specifically for Next.js applications.

## What is Ward?

Ward is an observability toolkit that understands Next.js. It provides:

- **Full-stack tracing** - Server Components, Client Components, Server Actions, API routes
- **Automatic instrumentation** - Zero-config setup with `@vercel/otel` integration
- **Local dev dashboard** - Real-time waterfall visualization during development
- **AI-ready** - MCP server for Claude and other AI coding assistants
- **OpenTelemetry native** - Works with any OTel-compatible backend

## Packages

| Package | Description |
|---------|-------------|
| [`@useward/instrumentation`](./packages/nextjs-integration) | Next.js instrumentation SDK |
| [`@useward/mcp`](./packages/mcp) | Model Context Protocol server for AI tools |
| `@useward/devtools` | Local development dashboard |

## Quick Start

### 1. Install

```bash
npm install @useward/instrumentation
```

### 2. Add instrumentation

```ts
// instrumentation.ts
import { register as registerWard } from '@useward/instrumentation';

export async function register() {
  if (process.env.NODE_ENV === 'development') {
    await registerWard();
  }
}
```

```ts
// instrumentation-client.ts
import { register as registerWard } from '@useward/instrumentation/client';

export function register() {
  if (process.env.NODE_ENV === 'development') {
    registerWard();
  }
}
```

### 3. Run the devtools

```bash
npx @useward/devtools
```

Open [http://localhost:19393](http://localhost:19393) to see your traces.

## MCP Integration

Ward includes an MCP server for AI coding assistants like Claude:

```bash
npx @useward/mcp
```

Add to your Claude configuration to get performance insights while coding.

## Features

### Server-Side Tracing
- RSC (React Server Components) render timing
- Server Actions execution
- API route performance
- Database query detection
- Fetch request waterfalls

### Client-Side Tracing
- Hydration timing
- Navigation events
- Web Vitals (FCP, LCP)
- Client-side fetches
- Long task detection

### Issue Detection
- N+1 query patterns
- Waterfall request chains
- Missing cache configurations
- RSC sequential fetches

## Requirements

- Next.js 15+
- React 18+
- Node.js 22+

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run development mode
pnpm dev
```

## License

[FSL-1.1-Apache-2.0](./LICENSE) - Free to use, converts to Apache 2.0 after 2 years.

Copyright 2025 PerfoTech, LLC
