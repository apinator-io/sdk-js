# Contributing to @apinator/client

## Development Setup

```bash
git clone https://github.com/apinator/client-js.git
cd client-js
npm install
npm run build
npm test
```

## Code Standards

- TypeScript strict mode — no `any` types, use `unknown` and narrow
- Zero external dependencies — browser APIs only
- All public APIs must have JSDoc comments
- 85%+ test coverage

## Commit Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(js): add connection timeout option
fix(js): correct reconnect delay calculation
docs(js): update presence channel example
test(js): add auth edge case coverage
chore(js): update tsup to v9
```

## Pull Request Process

1. Fork the repo and create a feature branch from `main`
2. Write tests for any new functionality
3. Run the full test suite: `npm test`
4. Run the type checker: `npm run typecheck`
5. Update documentation if you changed public APIs
6. Submit a PR with a clear description of what and why

## Architecture

See [docs/architecture.md](docs/architecture.md) for an overview of the codebase structure.

## Reporting Issues

Use [GitHub Issues](https://github.com/apinator/client-js/issues) with the provided templates.
