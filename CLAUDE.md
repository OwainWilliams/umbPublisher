# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**umbPublisher** is an Obsidian plugin (v1.5.0) that enables users to publish Markdown notes from Obsidian directly to Umbraco 15+ as content items via the Umbraco Management API.

**Key domain concept:** The plugin bridges Obsidian (note-taking) and Umbraco (CMS), handling authentication, content transformation, image uploads, and document creation using Umbraco's REST API.

## Architecture

### High-Level Flow

1. **Plugin Initialization** → Settings validation → Service instantiation
2. **User triggers publish** (ribbon icon or command palette) → Content parsing
3. **Content processing** → Image extraction and upload to Umbraco media library
4. **Document creation** → Varies by content mode (Property Editor, Block List, or Block Grid)

### Core Layers

#### 1. **Plugin Layer** (main.ts)
- Extends Obsidian's `Plugin` class
- Lifecycle: `onload()` → initialize services → setup UI
- Entry points: ribbon icon click, editor command handler
- Handles settings migration (legacy `useBlockList` boolean → new `ContentMode` enum)

#### 2. **Service Layer** (services/)

**UmbracoApiService** — Low-level API communication
- Bearer token management (client credentials OAuth flow)
- Generic `callApi<T>()` method for CRUD operations
- Specialized methods: `uploadFile()`, `uploadBinary()` for multipart form data
- Endpoint: `{websiteUrl}/umbraco/management/api/v1/`

**DocumentService** — High-level document creation orchestration
- Branching logic by `ContentMode`: legacy property editor vs. Block List/Grid
- Property introspection (fetches document type details including compositions)
- Calls MediaService for image processing before document creation
- Creates document via `/umbraco/management/api/v1/document` POST

**MediaService** — Image upload and folder management
- Gets or creates "Obsidian" folder in Umbraco media library
- Three-step upload: temporary file → image media item → replace markdown with HTML img tags
- Handles MIME type mapping and media URL retrieval
- Caches folder and type IDs to avoid redundant API calls

**ContentParser** — Markdown frontmatter and content extraction
- Parses YAML frontmatter (title, tags, featured, published status, etc.)
- Strips frontmatter from file content before publishing
- Returns `ParsedContent` interface with metadata and body

**SettingsValidator** — Configuration validation
- `validateBasicSettings()`: checks API credentials exist
- `validatePublishSettings()`: mode-specific validation (e.g., Block List requires `blockPropertyAlias`, `blockElementTypeId`, `blockContentPropertyAlias`)

**ErrorHandler** — User-facing error notifications via Obsidian's Notice system

#### 3. **Methods Layer** (methods/)

**getUmbracoDocType.ts**
- `GetUmbracoDocTypeById()` — fetches document type with properties and compositions
- `GetAllowedChildDocTypes()` — retrieves allowed child doc types for a parent node

**getElementType.ts**
- `GetBlockListElementTypes()` — fetches element types for a BlockList property
  - Traverses property → data type → BlockList config → parallel fetch of element types
- `GetElementTypeById()` — fetches a single element type (actually a document type)
- `FindContentProperty()` — heuristic to auto-detect content properties (markdown, content, text, richText, etc.)

**callUmbracoApi.ts** — Legacy low-level wrapper (now mostly replaced by UmbracoApiService, kept for utility methods)

**generateGuid.ts** — RFC4122-style v4 GUID generation for Umbraco entity IDs

#### 4. **Settings UI Layer** (settings/index.ts)

Complex SettingTab that:
- Fetches and displays Umbraco content tree (recursive with depth indentation)
- Cascading dropdowns: parent node → allowed child doc types → document type properties
- Content mode selector with conditional UI:
  - **Property Editor mode**: title + content property pickers
  - **Block List/Block Grid modes**: property → element type → content property pickers
- Caches API responses (`cachedNodes`, `cachedAllowedChildDocTypes`, etc.) to reduce redundant calls

## Key Domain Models & Types

### Settings Interface (types/index.ts)

```typescript
type ContentMode = 'propertyEditor' | 'blockList' | 'blockGrid';

interface umbpublisherSettings {
  websiteUrl: string;               // Base URL of Umbraco site
  clientId: string;                 // OAuth2 client credentials
  clientSecret: string;
  blogParentNodeId: string;         // Parent node for new documents
  blogDocTypeId: string;            // Document type to create
  blogDocTypeAlias: string;
  titleAlias: string;               // Property alias for title (all modes)
  blogContentAlias: string;         // Property alias for content (propertyEditor only)
  contentMode: ContentMode;
  blockPropertyAlias: string;       // Block List/Grid property alias
  blockElementTypeId: string;       // Element type within block
  blockElementTypeAlias: string;
  blockContentPropertyAlias: string;// Property alias on element type for content
}
```

### Document Creation Request

`CreateDocumentRequest` is defined and exported from `services/DocumentService.ts`. DocumentService builds it with:
- `id`: GUID for the document
- `parent`: parent node ID or null
- `documentType`: doc type ID
- `values`: array of properties with editor aliases
- `variants`: culture-aware name + publish state

For Block List/Grid, the `values` array includes a single block property with JSON structure:
```json
{
  "layout": { "Umbraco.BlockList": [{ contentUdi, ... }] },
  "contentData": [{ contentTypeKey, udi, [contentPropertyAlias]: content }],
  "settingsData": []
}
```

### DataProp (types/index.ts)

```typescript
interface DataProp {
  content: string;
}
```

Minimal wrapper used internally when passing content values through the block creation pipeline.

## Content Modes Explained

### Property Editor (Legacy)
- Content written directly to two properties: title + markdown
- Simplest mode; requires document type with text and markdown editor properties
- Image handling: markdown `![[image.png]]` → `<img src="..." />`

### Block List
- Content wrapped in an Umbraco BlockList structure
- One block per published document
- Useful when Umbraco stores content in reusable blocks

### Block Grid
- Identical to Block List but uses Block Grid editor
- Column/row span determined by BlockGrid configuration in Umbraco

## Build & Development

### Commands

```bash
npm run dev        # Watch mode with hot reload (esbuild watch)
npm run build      # Production build (TypeScript → esbuild minification)
npm run version    # Version bump script (updates manifest.json, versions.json)
```

### Build Output
- **Development**: `main.js` + source maps linked
- **Production**: `main.js` minified, no source maps
- **Destination**: `tsconfig.json` `outDir` points to `../../Vault/Develop/.obsidian/plugins/umbPublisher` — this is the author's local Obsidian vault path. New contributors must either symlink their own vault path or manually copy `main.js` + `manifest.json` to their plugin folder.

### TypeScript Configuration
- **Target**: ES6
- **Module**: ESNext
- **Strict mode**: Null checks enabled, `noImplicitAny: true`
- **Entry point**: `main.ts`

### ESBuild Configuration (esbuild.config.mjs)
- Bundles all code except Obsidian and CodeMirror libraries
- Loads SVG as text (for icons)
- Includes source maps in development for debugging

## API Integration Points

### Umbraco Management API (v1)

**Authentication**
```
POST /umbraco/management/api/v1/security/back-office/token
Body: grant_type=client_credentials&client_id=...&client_secret=...
Returns: { access_token, ... }
```

**Endpoints Used**
- `GET /document-type/{id}` — fetch doc type with properties and compositions
- `GET /document-type/{id}/allowed-children` — child doc types
- `GET /data-type/{id}` — data type details (for BlockList config)
- `POST /document` — create document
- `POST /media` — create media item (folder or image)
- `POST /temporary-file?id={id}` — upload temporary file (multipart form)
- `PUT /temporary-file/{id}` — binary file upload
- `GET /media/{id}` — fetch media details (to get URL)
- `GET /tree/document/...` — content tree navigation (root or children)
- `GET /tree/media/...` — media tree navigation

## Important Implementation Notes

### Property Resolution
Document types can inherit properties from **compositions** (mixins). When fetching properties, the code must:
1. Collect direct properties
2. For each composition, fetch the full composition doc type
3. Merge all properties into a single list

See `DocumentService.createDocumentLegacy()` and `createDocumentWithBlocks()` for the pattern.

### Editor Alias Mapping
Properties have a `dataType` object with an `editorAlias` field. The plugin attempts to use the correct editor alias when creating documents, with fallbacks:
- Title → `Umbraco.TextBox`
- Content → `Umbraco.MarkdownEditor`
- Booleans → `Umbraco.TrueFalse`
- Date → `Umbraco.DateTime`

If properties cannot be found, the plugin uses fallback aliases.

### Image Processing
1. Extract `![[imageName]]` from markdown using regex
2. Find the image file in Obsidian vault
3. Read as binary
4. Create "Obsidian" folder if needed
5. Upload to temporary file endpoint
6. Create image media item referencing temporary file
7. Replace markdown syntax with `<img src="{mediaUrl}" alt="{name}" />`

### Token Caching
`UmbracoApiService` caches the bearer token in memory during a session. Token is cleared on plugin unload (`onunload()`). Each API call checks for an existing token before requesting a new one.

### Settings Migration
On first load, if settings contain legacy `useBlockList` boolean, it's converted to the new `contentMode` enum and re-saved automatically.

## Testing & Linting

```bash
npm run build    # Runs TypeScript type-checking (tsc -noEmit -skipLibCheck)
                 # and esbuild for syntax validation
```

No unit test framework is configured. Manual testing in Obsidian is the current approach.

**Linting**: ESLint configured with TypeScript support. Rules:
- Unused variables flagged except in function parameters
- `@ts-comment` allowed (suppress TypeScript errors)
- Empty functions allowed

## File Structure

```
.
├── main.ts                          # Plugin entry point
├── settings/index.ts                # Settings UI (SettingTab)
├── types/index.ts                   # TypeScript interfaces
├── services/
│   ├── UmbracoApiService.ts        # Core API client
│   ├── DocumentService.ts           # Document creation logic
│   ├── MediaService.ts              # Image upload & media management
│   ├── ContentParser.ts             # Markdown parsing
│   ├── SettingsValidator.ts         # Settings validation
│   └── ErrorHandler.ts              # Error notifications
├── methods/
│   ├── getUmbracoDocType.ts        # Doc type & composition fetching
│   ├── getElementType.ts            # Block element type fetching
│   ├── callUmbracoApi.ts           # Legacy API wrapper
│   └── generateGuid.ts              # GUID generation
└── icons/icons.ts                   # Icon registration

Configuration:
├── package.json                     # Dependencies & scripts
├── tsconfig.json                    # TypeScript config
├── esbuild.config.mjs              # Build bundler
├── .eslintrc                        # Linting rules
└── manifest.json                    # Obsidian plugin metadata
```

## Common Development Tasks

**Adding a new content mode** is the most non-obvious change — it touches 4 files in concert:
1. Add value to `ContentMode` union in `types/index.ts`
2. Add mode-specific properties to `umbpublisherSettings` and `DEFAULT_SETTINGS`
3. Add validation in `SettingsValidator.validatePublishSettings()`
4. Add conditional UI controls in `settings/index.ts` (`SettingTab.display()`)
5. Add branching in `DocumentService.createDocument()` to call a new creation method

`DocumentService.createDocument()` receives `settings: umbpublisherSettings` as a method parameter (not via constructor) — the content mode dispatch happens there.
