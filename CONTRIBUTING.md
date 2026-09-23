# Contributing to Chatree

Thanks for helping improve Chatree. Focused bug fixes, compatibility work, tests, accessibility
improvements, documentation, and carefully scoped features are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before You Start

1. Read [README.md](README.md) and [docs/DEV.md](docs/DEV.md). The dev doc lists the **data
   contracts that must not change**, the interaction rules, and the known pitfalls.
2. Search existing issues and pull requests before starting duplicate work.
3. Open an issue before broad architecture changes, persistence migrations, protocol changes, or
   new collaboration features.
4. Never include API keys, private conversations, Authorization headers, or unsanitized browser
   storage in an issue or pull request.

## Local Setup

This project uses [Bun](https://bun.sh) exclusively — there is no npm or node script path.

```bash
git clone https://github.com/iroha3/chatree.git
cd treeAI
bun install
bun run dev
```

## Project Boundaries

- Chatree is a client-only application. Discuss any backend, account, telemetry, or sync proposal
  before implementing it.
- Keep the browser-to-provider request boundary explicit. Do not proxy, log, or persist credentials
  in a new location without a security review.
- The IndexedDB database is still named `TreeChatDatabase`, the export format is still
  `treeai-sessions`, and `localStorage` keys are still `treeai-*`, all for compatibility with
  existing local data. Do not rename them without a versioned migration. See `docs/DEV.md` §1.
- Keep OpenAI-compatible streaming behavior backward compatible unless a change is explicitly
  scoped as a protocol migration.
- Publish only source-confirmed features. Partially implemented work belongs in
  [docs/ROADMAP.md](docs/ROADMAP.md).
- Keep pull requests narrow; do not combine unrelated refactors with a fix.

## Verification

Run all checks before opening a pull request:

```bash
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit -p tsconfig.app.json
bun run build
```

For user-interface changes, also run the app, exercise the affected flow, and include a sanitized
screenshot when visual behavior changes. If the change touches node interaction or typography, run
the end-to-end regression suite described in [docs/DEV.md](docs/DEV.md) §6.

## Pull Requests

- Explain the user problem and the chosen solution.
- Link the relevant issue when one exists.
- Describe behavior changes and compatibility risks.
- Add or update tests when a practical test surface exists.
- Update README, changelog, screenshots, or limitations when user-facing behavior changes.
- Keep `bun.lock` changes limited to dependency changes made by the pull request.

## Reporting Security Issues

Do not open a public issue for a suspected vulnerability. Follow [SECURITY.md](SECURITY.md).
