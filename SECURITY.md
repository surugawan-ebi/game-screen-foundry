# Security Policy

Game Screen Foundry is a local-first browser workbench. It reads project files from local folders and serves selected local images through its local HTTP server.

## Supported Versions

Public beta support currently tracks the `main` branch.

## Local File Access

The `/api/source-file` endpoint only serves image files from:

- this repository folder
- folders explicitly loaded through the browser folder input
- folders containing manually imported asset PNGs

Arbitrary local files should not be exposed through the preview server. The release check includes tests for this boundary.

## Reporting Issues

For public beta, please report security-sensitive issues privately to the repository owner if you have a direct contact path. If not, open a GitHub issue with a minimal description and avoid posting private local paths, tokens, or project assets.

## Handling Local Project Data

- Do not commit `.env` files.
- Do not commit generated `imagegen-jobs/` output.
- Do not commit external game project workspaces into this repository.
- Treat bundled `examples/` as demo fixtures, not as production asset packs.

