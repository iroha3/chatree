# TreeAI Support

## Start Here

1. Confirm Node.js 18 or newer with `node --version`.
2. Run `npm ci`, then `npm run lint` and `npm run build`.
3. Review [Compatibility and Data Boundaries](README.md#compatibility-and-data-boundaries).
4. Remove secrets and private conversation content before sharing logs or screenshots.

## Common Problems

### The browser blocks the API request

TreeAI calls the configured provider directly. The provider must allow browser CORS requests from the TreeAI origin. If it does not, use a trusted local proxy that adds the required CORS headers.

### The endpoint returns 404

Enter the API base URL, usually ending in `/v1`, rather than the full `/chat/completions` path. TreeAI appends `/chat/completions` itself.

### No text appears while streaming

TreeAI expects Server-Sent Events containing `data:` lines and an OpenAI-style `choices[0].delta.content` field. Provider-specific reasoning streams and unrelated event formats are not currently supported.

### I need to clear local data

Sessions and model profiles live in browser IndexedDB under `TreeChatDatabase`. Use the browser's site-data or developer-tools storage controls to remove it. This permanently deletes local TreeAI data for that origin.

### File import fails

Only plain-text `.txt` and Markdown `.md` files are currently supported.

## Where to Ask

- Reproducible bugs: use the [bug report form](https://github.com/Anionex/treeAI/issues/new/choose).
- Focused feature proposals: use the feature request form.
- Setup and usage questions: use the question form.
- Security concerns: follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
