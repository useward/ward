# Contributing to Ward

Thank you for your interest in contributing to Ward!

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/useward/ward.git
cd ward

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### Project Structure

```
ward/
├── packages/
│   ├── nextjs-integration/  # Main SDK (published as `ward`)
│   ├── devtools/            # Local development dashboard
│   ├── mcp/                 # MCP server for AI tools
│   ├── domain/              # Shared analysis logic
│   └── shared/              # Shared constants
└── internal/                # Internal documentation
```

## Development Workflow

### Running Tests

```bash
pnpm test
```

### Type Checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint

# Auto-fix issues
pnpm format
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter ward build
```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Run tests and linting
4. Submit a pull request

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add support for X`
- `fix: resolve issue with Y`
- `docs: update README`
- `chore: update dependencies`

### Changesets

For changes that should be released, create a changeset:

```bash
pnpm changeset
```

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new features
- Update documentation as needed
- Ensure CI passes

## Code Style

- TypeScript with strict mode
- Biome for linting and formatting
- No `any` types

## Questions?

Open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the FSL-1.1-Apache-2.0 license.
