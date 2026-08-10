# Changelog

All user-visible changes to TreeAI are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses semantic versioning for tagged releases.

## [Unreleased]

### Added

- Bilingual English and Chinese project documentation.
- Repository-owned hero, product screenshot, and social-preview assets.
- MIT license, funding guide, security policy, support guide, contribution guide, issue forms, pull-request template, and CI workflow.
- Browser metadata and a TreeAI favicon.

### Changed

- Unified the visible product name as TreeAI.
- Documented the client-only data boundary, provider compatibility, credential storage, and current limitations.
- Limited file import to the TXT and Markdown formats that are actually implemented.
- Removed unused PDF and DOCX dependencies.
- Cleaned up TypeScript and React code so ESLint passes.

## [0.1.0] - 2025-05-13

### Added

- Initial public preview of the React Flow conversation-tree workspace.
- Local session and model persistence with Dexie and IndexedDB.
- OpenAI-compatible streaming chat requests and FreeMind export.
