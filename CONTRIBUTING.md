# Contributing

このリポジトリは public beta です。仕様や UI はまだ変わりますが、外部プロジェクトで安全に試せる状態を優先しています。

This repository is in public beta. The schema and UI may still change, but the priority is keeping the tool safe and practical for external projects.

## Development Setup

前提: Node.js 20 以上。  
Prerequisite: Node.js 20 or newer.

```sh
npm run release:check
npm run dev
```

Open:

```text
http://127.0.0.1:4311
```

To install the bundled Codex skill locally:

```sh
npm run skill:install
```

## Pull Request Checklist

- Run `npm run release:check`.
- Keep generated `imagegen-jobs/` files out of Git.
- Keep external game project files out of this repository.
- Update [docs/schema.md](docs/schema.md) when changing file contracts.
- Update [README.md](README.md) when changing user-facing workflow.
- Add or update tests for behavior changes.

## Design Boundaries

- This is a local-first workbench, not a hosted service.
- Do not add network calls to external generation services without an explicit opt-in design.
- Do not turn the product into a general image generator.
- Keep runtime text, values, labels, and notification counts separate from generated PNGs unless the asset explicitly owns baked text.
- Prefer portable project-relative paths over machine-local absolute paths.

## Code Style

- CommonJS modules.
- No build step for the browser app.
- No runtime dependencies unless they remove meaningful complexity.
- Keep behavior testable through `dispatchApi` or small exported helpers.
- Use focused tests that protect the screen assembly contract.
