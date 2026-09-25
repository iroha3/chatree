<div align="center">

# 🌳 Chatree

[![CI](https://img.shields.io/github/actions/workflow/status/iroha3/chatree/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/iroha3/chatree/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/iroha3/chatree?style=flat-square&color=3178C6)](https://github.com/iroha3/chatree/releases)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=0B172A)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](src/)

**A local-first visual workspace for non-linear LLM conversations.**

Explore parallel branches, compare models side-by-side, and read whole paths continuously.

🌐 [**中文**](README_CN.md) | **English**

</div>

<p align="center">
  <img src="assets/treeai-workspace.png" alt="Chatree canvas showing one system prompt branching into independent paths with follow-ups" width="100%">
</p>

<p align="center"><sub>One prompt, multiple independent exploration paths. Branch and compare at any point.</sub></p>

## Core Capabilities

### Branching as Reasoning
- **Fork from any node**: Test alternative questions, assumptions, or prompts while preserving the complete conversation history.
- **Strict ancestor context assembly**: Requests assemble messages strictly along the ancestor path; sibling branches are physically isolated to prevent context contamination and hallucinations.

### Canvas Topology + Continuous Reader
- **Global canvas overview**: Visualize thought evolution, pan, zoom, and rearrange branches with fluid gestures.
- **Continuous path reader**: Double-click any node to open an unbroken, scrollable reading flow from root to that turn. Seamlessly switch branches at any fork from the side panel, and continue scrolling at the bottom to advance smoothly to the next turn.

### Cross-Model Comparison
- **Per-node configuration**: Assign distinct models (DeepSeek, LM Studio, Ollama, OpenAI, etc.), temperatures, and reasoning efforts on a per-node basis.
- **Side-by-side evaluation**: Directly compare reasoning depth and code output across different models under the exact same prior context.

---

## Privacy & Security

- **Local-first**: Client-only architecture. All sessions, tree topology, and model settings live solely inside your browser's IndexedDB, with zero relay servers.
- **Direct credentials**: API keys are stored locally and sent directly from your browser to target provider endpoints; export backups automatically omit API keys to prevent credential leaks.
- **Fully offline**: Zero third-party CDN dependencies; operates seamlessly in air-gapped or private intranet environments.
- **Granular metrics**: Real-time breakdown of token usage (prompt, completion, reasoning tokens), context cache hit rate, and generation throughput (tok/s).

---

## Usage

### Web
Visit [chatree.pages.dev](https://chatree.pages.dev) to use directly in any modern browser.

### Desktop Client
Download pre-built packages or portable binaries from [Releases](https://github.com/iroha3/chatree/releases):
- **Windows**: `.msi` installer / portable `Chatree.exe`
- **macOS**: Universal bundle (Apple Silicon & Intel)
- **Linux**: `.deb` / `.AppImage`

### Docker Deployment
Run self-hosted with the pre-built container image:

```bash
docker run -d -p 8080:80 ghcr.io/iroha3/chatree:latest
```

Access `http://localhost:8080` in your browser.

---

## Development

```bash
git clone https://github.com/iroha3/chatree.git
cd chatree
bun install
bun run dev
```

Open the address printed in the terminal (defaults to `http://127.0.0.1:5175`).

> For architecture details, data contracts, testing (`bun test:edge` / `bun test:ux`), and desktop packaging, please refer directly to [`docs/DEV.md`](docs/DEV.md).

---

## License & Acknowledgements

Chatree is derived from [Anionex/treeAI](https://github.com/Anionex/treeAI) (MIT License). Grateful to the original authors for establishing the foundation.

Released under the [GNU AGPLv3 License](LICENSE).
