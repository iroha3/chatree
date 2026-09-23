# Changelog

All user-visible changes to Chatree are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
semantic versioning for tagged releases. `package.json`'s `version` is the single source of truth.

## [Unreleased]

### Added

- **Desktop app** built with Pake (Windows / macOS / Linux), fully offline and self-contained.
- **Update check** on the About page: compares against the latest GitHub release and links to the
  download page (desktop only; the web build is always current).
- **Read overlay**: double-click a node to read one answer in a roomy, read-only panel.
- **Delete protection**: deleting a node asks for confirmation, aborts in-flight requests, and can
  be undone for 8 seconds.
- **Stop generation** while streaming, keeping the text generated so far.
- **Folders, favorites, and full-text search** in the sidebar.
- **Bilingual UI** (Chinese / English), switchable at runtime.
- **Settings center** with model, data, appearance, and about sections.
- **Usage stats** per answer: tokens, cache hit rate, and speed.
- **Reasoning-model support**: live chain-of-thought on a separate channel, reasoning effort,
  and thinking-token counts.
- **JSON backup / restore**, for everything or a single session.
- **Dark mode**, automatic session naming, and viewport following.

### Changed

- Renamed the product to **Chatree** (internal identifiers — Dexie database name, export format,
  and `localStorage` keys — intentionally unchanged to avoid data loss).
- Card width reduced, node spacing tightened, and markdown typography polished (tighter paragraph
  and list rhythm; a smaller body size in the read overlay).
- **Generation control is now one button** (ChatGPT-style), always visible in the node's
  bottom-right corner: **send** while editing → **stop** while streaming → **regenerate** when idle.
  The inline send button inside the input box is gone, so leaving edit mode no longer hides the
  send action.
- Leaving a node's edit mode no longer requires pressing send: clicking outside the node or
  pressing `Esc` also exits. The draft is kept, and controls inside the node don't interrupt editing.
- Reasoning output auto-expands while the model is thinking and quietly collapses when it finishes.
- Clipboard copy now gives instant feedback (icon becomes a check mark) and no longer triggers a
  native permission prompt on the desktop build.
- Confirmation prompts use an in-app dialog instead of `window.confirm`.
- `bun` is now the only supported toolchain; `package-lock.json` was removed.
- Documentation consolidated into `README`, `docs/DEV.md`, and `docs/ROADMAP.md`.

### Fixed

- Deleted nodes no longer reappear after a later store update.
- Disabled React Flow's Backspace delete shortcut, which bypassed confirmation and undo.
- Fixed HTML5 drag-and-drop (model reordering, dragging sessions into folders) in the desktop app.
- Fixed copy toasts rendering *behind* the read overlay.
- Fixed a CSS specificity bug that made the favorite star fail to turn gold on hover.
- Fixed the sidebar title being truncated on hover.
- Fixed markdown code blocks rendering with a wider header bar than code area (the language
  strip with the three dots was 12px wider on each side) and a gap between the two.
- Token stats now use ↑ for input and ↓ for output, and every metric carries its unit
  (`tok` / `chars` / `%` / `tok/s`) instead of only the last one.

### Security

- Disabled raw HTML in Markdown rendering (`markdownItConfig: md => md.set({ html: false })`),
  closing a real XSS vector reachable through model output.

## [0.1.0]

### Added

- Initial public preview of the React Flow conversation-tree workspace, forked from
  [Anionex/treeAI](https://github.com/Anionex/treeAI).
- Local session and model persistence with Dexie and IndexedDB.
- OpenAI-compatible streaming chat requests and FreeMind export.
