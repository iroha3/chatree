# Changelog

All user-visible changes to Chatree are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
semantic versioning for tagged releases. `package.json`'s `version` is the single source of truth.

## [Unreleased]

### Changed

- **The canvas now pans on a normal scroll wheel, and zooms with Ctrl/⌘ + wheel.** React Flow
  defaults to "wheel = zoom", which made a long single-chain conversation almost unreadable:
  the only way to go down was to drag the canvas (or zoom out and back in). Trackpad two-finger
  scrolling pans too, so a long chat now reads like a document. Wheeling over a card first
  scrolls the card's own content (long answer, reasoning, user message) and only pans the canvas
  once that inner area hits its end — no more "stuck" feeling when the cursor is on a card.
- Canvas top-right: the separate "export JSON" and "mind map" icons are merged into one
  **Share** menu (backup / mind map), so future formats (PDF, DOCX, standalone HTML) have a
  place to go without adding more icons to the row. Export as a whole is still on hold
  (see `ROADMAP.md`).
- Card width adjusted to **516px** (started 548px; the last instruction meant *wider*, not
  narrower: 468 × 1.05 × 1.05 ≈ 516).
- More breathing room on both sides of the Data / Appearance / About settings panes.

### Fixed

- **A deleted/cleared system prompt no longer comes back.** Generation used to fall back to
  `model.defaultSystemPrompt` whenever the system node was missing or empty, so a session where
  the user had removed the system prompt still sent one (and reported its tokens). The system
  prompt now comes **only** from the system node.
- Session stats showed the input/output token arrows backwards (`↓ input` / `↑ output`);
  they now match the node cards (`↑ input` / `↓ output`, per `DEV.md` §3.10).
- The floating action cluster (copy / regenerate / expand) sat **1px** to the right of the send
  button: the cluster is outside `.node-content` while the send button is inside its 1px border.
  Anchored to `calc(1.5rem + 1px)` now, so both right edges line up exactly.
- Mind-map export no longer fails when there is no system node (a valid state after removing the
  system prompt), and it reports failures through the in-app toast instead of `window.alert`.
- "Characters" is now counted by Unicode code point, so an emoji no longer counts as two.
- Token usage mapping (DeepSeek / OpenAI / Anthropic cache fields, reasoning tokens) was
  extracted into a pure `normalizeUsage` with regression tests (`bun test:usage`). The tooltip
  now spells out that `↑` is the **whole** request input (system prompt + history), not just the
  last user message — that is why "你好" alone can show a double-digit input count.

## [0.2.0] - 2026-09-23

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
  - Later in the same release this was split up again, because a button that has nothing to do with
    typing shouldn't sit in the input box: **send** now lives in the input box's bottom-right and
    only appears while editing; **stop / regenerate / copy / expand** form one hover-revealed row
    at the card's bottom-right, all right-aligned to the same 24px column.
- Every icon button on a card is the same size (14px, `p-1`), and the model name in the card header
  is one step larger.
- The per-node **max-tokens slider is gone** — a 256–65535 range with `step=1` can't land on a value
  you actually want. Max tokens is configured per model instead, as a number input.
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
- The send button no longer covers the textarea's native resize handle (the textarea is no longer
  resizable, and the button sits 8px inside its corner).
- The browser tab / desktop window title now follows the UI language instead of always being English.
- **Session ordering**: a session only moves to the top when you actually start a generation.
  Editing a message (or entering edit mode and leaving it untouched), changing the model or
  temperature, dragging a card, renaming, and deleting a node no longer reorder the sidebar.
  The stats panel row that used to read "Updated" is now "Last message".

### Documentation

- Added a **Deployment** section (Cloudflare Pages settings, SPA fallback, Docker) and fixed the
  build failure caused by `vite` being a devDependency that the host never installed.

### Security

- Disabled raw HTML in Markdown rendering (`markdownItConfig: md => md.set({ html: false })`),
  closing a real XSS vector reachable through model output.

## [0.1.0] - 2026-09-23

### Added

- Initial public preview of the React Flow conversation-tree workspace, forked from
  [Anionex/treeAI](https://github.com/Anionex/treeAI).
- Local session and model persistence with Dexie and IndexedDB.
- OpenAI-compatible streaming chat requests and FreeMind export.
