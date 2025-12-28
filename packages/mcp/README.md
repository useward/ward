# @ward/mcp

Model Context Protocol (MCP) server for Ward. Exposes Next.js observability data to AI coding assistants like Claude.

## Installation

```bash
npm install -g @ward/mcp
```

## Usage

### With Claude Desktop

Add to your Claude configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ward": {
      "command": "npx",
      "args": ["@ward/mcp"]
    }
  }
}
```

### Standalone

```bash
npx @ward/mcp
```

## Prerequisites

The MCP server connects to Ward devtools. Make sure devtools is running:

```bash
npx @ward/devtools
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all monitored Next.js projects |
| `get_sessions` | Get recent page sessions with performance metrics |
| `get_session_details` | Get detailed resource waterfall for a session |
| `diagnose_performance` | Analyze performance bottlenecks and get suggestions |
| `get_errors` | Retrieve errors from recent sessions |
| `find_slow_requests` | Find HTTP/DB requests above a threshold |

## Example Prompts

Once connected, ask Claude:

- "What's slow in my app?"
- "Show me the waterfall for the last page load"
- "Are there any N+1 queries?"
- "What performance issues should I fix?"

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WARD_DEVTOOLS_URL` | `http://localhost:19393` | Devtools server URL |

## How It Works

1. Ward SDK instruments your Next.js app
2. Devtools server collects telemetry
3. MCP server connects to devtools via SSE
4. AI assistants query performance data through MCP tools

## License

[FSL-1.1-Apache-2.0](../../LICENSE)
