<p align="center">
  <img src="assets/hero.png" alt="Chatree — a visual workspace for branching LLM conversations" width="100%">
</p>

<div align="center">

# Chatree

[![CI](https://img.shields.io/github/actions/workflow/status/iroha3/chatree/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/iroha3/chatree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/iroha3/chatree?style=flat-square&color=2F7A5A)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=0B172A)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](src/)

**Branch the conversation. Keep every line of thought.**

A local-first visual workspace for exploring, comparing, and exporting LLM conversation trees across OpenAI-compatible models. Also ships as a desktop app.

🌐 [**中文**](README_CN.md) | **English**

</div>

Linear chat forces every follow-up into one timeline: explore a different assumption and the original path is pushed out of view. Chatree turns the conversation into a canvas. Continue from any node, create parallel branches, switch model settings per branch, and preserve every route for later comparison.

All sessions and model configurations stay in the browser's IndexedDB. Requests go directly from the browser to the API endpoint you configure; Chatree has no application backend.

<p align="center">
  <img src="assets/treeai-workspace.png" alt="Chatree canvas showing one system prompt branching into two independent replies, with a third follow-up continuing from the left branch" width="100%">
</p>

<p align="center"><sub>One prompt, multiple independent paths. Continue any branch without overwriting the others.</sub></p>

## Why Chatree

| Capability | What it gives you |
|---|---|
| **Branch from any node** | Explore an alternative question, assumption, or answer while preserving the original conversation path. |
| **Tune each branch independently** | Select the model, temperature, and token budget at the node level instead of locking one configuration to the whole session. |
| **Reasoning-model friendly** | Live chain-of-thought while it thinks, auto-collapsed when it's done, plus configurable reasoning effort. |
| **Per-answer usage stats** | Token counts, cache hit rate, and speed for every answer. |
| **Organize** | Folders, favorites, and full-text search across conversations. |
| **Local-first & offline** | Data lives only in your browser; zero third-party CDN requests, so it also works on an intranet. |
| **Backup & restore** | JSON export/import for everything, or a single session. API keys never enter backups. |
| **Desktop app** | Optional native build (Windows / macOS / Linux) that bundles the whole app. |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (the project uses bun exclusively — no npm/node scripts)
- An OpenAI-compatible API that supports streaming `POST /chat/completions`
- A provider that allows browser CORS requests from your Chatree origin

### Run locally

```bash
git clone https://github.com/iroha3/chatree.git
cd chatree
bun install
bun run dev
```

Open the URL printed by Vite (this project defaults to `http://127.0.0.1:5175`).

### First conversation

1. Open **Model settings** from the gear button in the lower-left corner.
2. Add a model name, an API base URL such as `https://api.openai.com/v1`, an API key, and the provider's model identifier.
3. Create a conversation and edit the system-prompt node.
4. Add a child node, enter a message, and send it.
5. Use the **+** button on any node to continue that branch or start a parallel one.

> [!IMPORTANT]
> API keys are stored unencrypted in this browser's IndexedDB because Chatree is a client-only application. Use restricted keys or a trusted local proxy, and do not configure secrets on a shared or untrusted device.

## Desktop App

Optional native wrapper built with [Pake](https://github.com/tw93/Pake) (Tauri). No Rust lives in this repository.

```bash
bun run desktop:build        # full bundle for the current platform
bun run desktop:build:fast   # quick local build (executable only)
```

See [`docs/DEV.md`](docs/DEV.md) for build requirements and known pitfalls.

## How It Works

- **Conversation graph:** each chat node stores a `parentId`, allowing the UI to reconstruct and render independent branches.
- **Context assembly:** when a node is sent, Chatree walks its ancestors and sends only that branch's message chain.
- **Streaming:** responses are consumed from Server-Sent Events and rendered incrementally in the active node, with reasoning output on a separate channel.
- **Persistence:** sessions, node positions, and model profiles are stored locally through Dexie.

## Compatibility and Data Boundaries

Chatree targets OpenAI-style streaming Chat Completions APIs. A compatible provider must:

- expose `POST {baseUrl}/chat/completions`;
- accept `Authorization: Bearer ...`;
- return `data:` Server-Sent Events with OpenAI-like `choices[0].delta.content`, or one of the small fallback text shapes handled in `apiService.ts`;
- allow direct browser requests through CORS.

Chatree sends the configured API key directly to that provider. The repository does not include a relay server, analytics service, or cloud account system.

## Project Status

Chatree is an early-stage project (`0.1.0`). The core branching workflow builds and runs. Remaining work and known limitations are tracked in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Development

| Command | Purpose |
|---|---|
| `bun run dev` | Start the Vite development server. |
| `bun run lint` | Run ESLint across the project. |
| `bun run build` | Create a production bundle. |
| `bun run preview` | Serve the production build locally. |
| `bun test:edge` | Logic regression (no browser needed). |
| `bun test:smoke` / `bun test:ux` | End-to-end regression (needs Edge + dev server). |

Read [`docs/DEV.md`](docs/DEV.md) before making changes — it documents the data contracts that must not change, the interaction rules, and the React Flow / Vite / Pake pitfalls.

## Community

- Bugs and feature requests: [Issue forms](https://github.com/iroha3/chatree/issues/new/choose)
- Development setup, data contracts, and conventions: [`docs/DEV.md`](docs/DEV.md)
- Roadmap and known limitations: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- User-visible changes: [Changelog](CHANGELOG.md)

## Credits

**Chatree is a derivative work built on [Anionex/treeAI](https://github.com/Anionex/treeAI).** Credit for the foundations belongs upstream:

- the tree-structured conversation model (per-node `parentId`, per-branch context assembly),
- the local-first IndexedDB architecture with Dexie,
- the original React Flow canvas, and
- the OpenAI-compatible streaming client.

Chatree adds the desktop build, the reasoning/usage-statistics layer, the settings center, folders and search, bilingual UI, and a long list of interaction fixes.

We keep upstream's MIT copyright notice verbatim in [`LICENSE`](LICENSE) (our own notice is appended below it), and we keep the **entire upstream commit history** — `git log` and `git blame` still show exactly who wrote what.

If it helps you explore LLM conversations more clearly, a star on [both repositories](https://github.com/Anionex/treeAI) is appreciated.

Released under the [MIT License](LICENSE).
