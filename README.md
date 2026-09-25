<p align="center">
  <img src="assets/hero.png" alt="Chatree — A visual workspace for branching LLM conversations" width="100%">
</p>

<div align="center">

# Chatree

[![CI](https://img.shields.io/github/actions/workflow/status/iroha3/chatree/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/iroha3/chatree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/iroha3/chatree?style=flat-square&color=2F7A5A)](LICENSE)
[![Release](https://img.shields.io/github/v/release/iroha3/chatree?style=flat-square&color=3178C6)](https://github.com/iroha3/chatree/releases)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=0B172A)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](src/)

**Branch the conversation. Keep every line of thought.**

A local-first visual workspace for non-linear exploration, parallel reasoning, and model comparison across OpenAI-compatible providers. Ships as a web app and lightweight native desktop client.

🌐 [**中文**](README_CN.md) | **English**

</div>

Linear chat forces every train of thought into a single timeline: explore an alternative hypothesis, and earlier insights are either overwritten or buried in awkward carousels. Multi-turn chats frequently suffer from context contamination and uncontrollable token bloat.

Chatree transforms conversations into an exploratory canvas and branching tree. Branch from any node, attach different models or sampling parameters to parallel paths, compare response quality side-by-side, and read long dialogue chains smoothly using an integrated path reader.

All sessions and model configurations stay in your browser's local IndexedDB. Network requests go directly to configured provider endpoints without any application-tier relay.

<p align="center">
  <img src="assets/treeai-workspace.png" alt="Chatree canvas showing one system prompt branching into independent paths with follow-ups" width="100%">
</p>

<p align="center"><sub>One prompt, multiple independent exploration paths. Branch and compare at any point.</sub></p>

## Core Capabilities

### 1. Branching as Reasoning
- **Fork from any point**: Test new angles, alter assumptions, or refine prompts without disrupting existing conversation trees.
- **Strict ancestor context assembly**: Only messages along the direct ancestor path are assembled when generating. Sibling branches are completely isolated, preventing context contamination and hallucinations.

### 2. Dual-Mode Experience: Topology Canvas + Continuous Path Reader
- **Global canvas overview**: Visualize thought evolution, pan, zoom, and rearrange branches with fluid gestures.
- **Continuous path reader**: Double-click any node to open an unbroken, scrollable reading flow from root to that turn. Seamlessly switch branches at any fork from the side panel, and continue scrolling at the bottom to advance smoothly to the next turn.

### 3. Per-Node Control & Cross-Model Comparison
- **Granular parameters**: Assign distinct models (DeepSeek, OpenAI, Claude, Ollama, etc.), temperatures, and reasoning efforts on a per-node basis.
- **Side-by-side evaluation**: Directly compare reasoning depth and code output across different models under the exact same prior context.

### 4. Local-First Architecture & Engineering Transparency
- **Offline & self-contained**: Zero third-party CDN dependencies; all data resides strictly inside your browser's IndexedDB, ready for offline or intranet deployment.
- **Granular metrics**: Real-time breakdown of token usage (prompt, completion, reasoning tokens), context cache hit rate, and generation throughput (tok/s).
- **Reasoning-model friendly**: Dedicated live stream for chain-of-thought, quietly auto-collapsing upon completion.

---

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) (Chatree exclusively uses the Bun toolchain)
- An OpenAI-compatible API endpoint supporting streaming `POST /chat/completions`
- CORS enabled for your Chatree origin on the provider endpoint

### Local Development

```bash
git clone https://github.com/iroha3/chatree.git
cd chatree
bun install
bun run dev
```

Open the local server URL printed by Vite (defaults to `http://127.0.0.1:5175`).

### Getting Started

1. Open **Settings → Models** from the gear icon in the lower-left corner.
2. Enter your model name, API base URL (e.g. `https://api.deepseek.com/v1`), API key, and provider Model ID.
3. Create a new conversation and configure the system prompt node.
4. Click `+` on the node to create a message card, type your question, and send.
5. Click `+` on any node to fork a new branch; double-click a card to enter continuous reading mode.

> [!IMPORTANT]
> Chatree is a client-side application. API keys are stored unencrypted in this browser's local IndexedDB. Use restricted keys and avoid configuring credentials on shared untrusted machines. Backup export files omit API keys by default.

---

## Desktop Client

A lightweight native desktop wrapper (Windows / macOS / Linux) built using [Pake](https://github.com/tw93/Pake):

```bash
bun run desktop:build        # Full installation package for the current OS
bun run desktop:build:fast   # Quick local executable build
```

See [`docs/DEV.md`](docs/DEV.md) for build requirements and platform-specific details.

---

## Development & Testing

| Command | Purpose |
|---|---|
| `bun run dev` | Start local Vite development server |
| `bun run lint` | Run ESLint |
| `bun run build` | Produce production bundle in `dist/` |
| `bun test:edge` | Validate edge contract and React Flow state logic |
| `bun test:usage` | Test token normalization and usage parsing |
| `bun test:tree` | Verify tree traversal and ancestor path assembly |
| `bun test:ux` | End-to-end node interaction and layout assertions |

Please consult [`docs/DEV.md`](docs/DEV.md) before contributing to review invariant data contracts and UI conventions.

---

## Deployment

- **Static Hosting (Cloudflare Pages, etc.)**: The build output is a pure static `dist/` directory. Configure build command as `bun install --frozen-lockfile && bun run build`, output directory as `dist`, and set an SPA fallback rule: `/* → /index.html 200`.
- **Docker**: Includes a multi-stage `Dockerfile` (`oven/bun` + `nginx:alpine`) for self-hosted containerized deployment.

---

## License & Acknowledgements

Chatree is derived from [Anionex/treeAI](https://github.com/Anionex/treeAI) (MIT License). Grateful to the original authors for establishing the foundation.

Released under the [MIT License](LICENSE).
