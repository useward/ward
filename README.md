# Ward

[![CI](https://github.com/useward/ward/actions/workflows/ci.yml/badge.svg)](https://github.com/useward/ward/actions/workflows/ci.yml)
[![npm @useward/instrumentation](https://img.shields.io/npm/v/@useward/instrumentation?label=instrumentation)](https://www.npmjs.com/package/@useward/instrumentation)
[![npm @useward/devtools](https://img.shields.io/npm/v/@useward/devtools?label=devtools)](https://www.npmjs.com/package/@useward/devtools)
[![npm @useward/mcp](https://img.shields.io/npm/v/@useward/mcp?label=mcp)](https://www.npmjs.com/package/@useward/mcp)

> **Note:** Ward is under active development and not yet feature-complete. APIs may change between releases.

Next.js-native observability. See everything happening in your app - from Server Components to client hydration - with a local dashboard and AI-powered debugging via MCP.

## Packages

| Package | Description |
|---------|-------------|
| [`@useward/instrumentation`](./packages/nextjs-integration) | Next.js instrumentation SDK |
| [`@useward/devtools`](./packages/devtools) | Development server and local dashboard |
| [`@useward/mcp`](./packages/mcp) | MCP server for AI coding assistants |

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

Ward includes an [MCP](https://modelcontextprotocol.io) server that exposes your app's telemetry to AI coding assistants:

```json
{
  "mcpServers": {
    "ward": {
      "command": "npx",
      "args": ["@useward/mcp"]
    }
  }
}
```

Works with Claude Code, Cursor, and other MCP-compatible tools.

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
