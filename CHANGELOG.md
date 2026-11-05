# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
