# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Restored `minAppVersion` 1.14.4 in `manifest.json`. 1.7.3 shipped the new settings tab with `minAppVersion` 1.10.6, so on Obsidian before 1.13 its settings would not render
  - `versions.json` now maps 1.7.3 to 1.14.4 too, so older Obsidian versions are offered 1.7.2 instead
- Removed the unused `mySetting` setting left over from Obsidian's sample plugin

## [1.7.3] - 2026-11-06

### Changed
- Settings tab rebuilt on Obsidian's declarative settings API, so umbPublisher settings now appear in Obsidian's settings search
  - Settings are grouped under headings: Umbraco connection, Content location, Content mode, the mode's own settings, and Optional properties
  - Resolves the "PluginSettingTab does not implement getSettingDefinitions()" warning
- **Requires Obsidian 1.14.4 or later** (`minAppVersion` raised from 1.10.6). Older Obsidian versions stay on umbPublisher 1.7.2
- Updated the `obsidian` API package to 1.14.4
- Release assets (`main.js`, `manifest.json`, `styles.css`) now have signed GitHub build provenance attestations
- Image embeds are resolved with Obsidian's link resolver and a direct path lookup, so the plugin no longer enumerates every file in the vault
- GUIDs for new documents and blocks are generated from `crypto.getRandomValues` instead of `Math.random`
- Replaced the deprecated `workspace.activeLeaf` with `getActiveViewOfType(MarkdownView)`
- Removed unused code flagged by the plugin review and lint (`Editor` import, `randomBytes`, `start`, redundant type annotations)

## [1.6.0]

### Added
- Optional **Description property** setting: the note's frontmatter `description` is sent to a mapped Umbraco property as plain text
  - Works with text area, text box, markdown and rich text properties; rich text receives the text HTML-escaped in a paragraph
  - Available in Property Editor, Block List and Block Grid modes
- Settings validation rejects a description property that is already used for the title, content or tags

## [1.5.0] - 2026-06-12

### Added
- Support for tags to be submitted with published documents
- Tags are now extracted from Obsidian note frontmatter and sent to Umbraco

### Changed
- Updated version references across package configuration files
- Removed unused dependencies: `dotenv`, `node-fetch`, `@types/node-fetch`, `builtin-modules`
  - Plugin already uses Obsidian's `requestUrl` API instead of node-fetch
  - Build configuration simplified with explicit Node.js built-ins list in esbuild config
  - Resolves Obsidian compatibility flags for Node.js-specific packages

## [1.4.0] - Previous Release

### Features
- Initial plugin with core publishing functionality
- Support for Property Editor, Block List, and Block Grid content modes
- Image upload and media management
- Markdown content parsing with frontmatter support
- OAuth2 authentication with Umbraco Management API
