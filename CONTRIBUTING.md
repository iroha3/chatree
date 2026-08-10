# Contributing to TreeAI

Thanks for helping improve TreeAI. Focused bug fixes, compatibility work, tests, accessibility improvements, documentation, and carefully scoped features are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before You Start

1. Read [README.md](README.md), especially compatibility, data boundaries, and limitations.
2. Search existing issues and pull requests before starting duplicate work.
3. Open an issue before broad architecture changes, persistence migrations, protocol changes, or new collaboration features.
4. Never include API keys, private conversations, Authorization headers, or unsanitized browser storage in an issue or pull request.

## Local Setup

Use Node.js 18 or newer:

```bash
git clone https://github.com/Anionex/treeAI.git
cd treeAI
npm ci
npm run dev
```

## Project Boundaries

- TreeAI is currently a client-only application. Discuss any backend, account, telemetry, or sync proposal before implementing it.
- Keep the browser-to-provider request boundary explicit. Do not proxy, log, or persist credentials in a new location without a security review.
- The IndexedDB database is still named `TreeChatDatabase` for compatibility with existing local data. Do not rename it without a versioned migration.
- Keep OpenAI-compatible streaming behavior backward compatible unless a change is explicitly scoped as a protocol migration.
- Publish only source-confirmed features. Partially implemented work belongs in project status or limitations.
- Keep pull requests narrow; do not combine unrelated refactors with a fix.

## Verification

Run all checks before opening a pull request:

```bash
npm ci
npm run lint
npm run build
```

For user-interface changes, also run the app, exercise the affected flow, and include a sanitized screenshot when visual behavior changes.

## Pull Requests

- Explain the user problem and the chosen solution.
- Link the relevant issue when one exists.
- Describe behavior changes and compatibility risks.
- Add or update tests when a practical test surface exists.
- Update README, changelog, screenshots, or limitations when user-facing behavior changes.
- Keep generated lockfile changes limited to dependency changes made by the pull request.

## Reporting Security Issues

Do not open a public issue for a suspected vulnerability. Follow [SECURITY.md](SECURITY.md).
