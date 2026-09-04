<img src="assets/umbPublisher-Logo.png" alt="Document Type" width="100px"></img>
# umbPublisher - an Obsidian plugin.

This plugin allows you to push your [Obsidian](https://obsidian.md/) notes to [Umbraco 15+](https://umbraco.com) as a content item.

It uses the Management API within Umbraco to create notes in Markdown format. You will need to create an API user in Umbraco for this to work.

To see how to use this plugin with Obsidian, check out the [Wiki pages](https://github.com/OwainWilliams/umbpublisher/wiki)

## Settings

Open **Settings > umbPublisher** in Obsidian to configure the plugin.

### API Credentials

| Setting | Description |
|---------|-------------|
| **Website URL** | The base URL of your Umbraco site (e.g. `https://example.com`). Trailing paths are automatically stripped. |
| **Client ID** | The API client ID from Umbraco's back office. |
| **Client Secret** | The API client secret. |

### Content Structure

1. **Pick content parent node** - Click "Fetch nodes" to load your Umbraco content tree. Select the parent node where new documents will be created as children.

2. **Allowed child document types** - After selecting a parent node, click "Fetch child doc types" to load the document types allowed under that parent. Select the document type to use when creating new documents.

### Content Mode

Choose how your markdown content is stored on the Umbraco document type. The three modes are mutually exclusive - select the one that matches your Umbraco setup.

#### Property Editor (default)

Content is written directly to properties on the document type. This is the simplest mode.

**Settings:**
- **Title property** - The property alias for the document title (e.g. `title`)
- **Content property** - The property alias for the markdown content (e.g. `blogContent`)

Click "Fetch properties" to load the available properties from your document type, then select the appropriate ones from the dropdowns.

#### Block List

Content is wrapped in an Umbraco Block List structure. Use this when your document type stores content inside a Block List property.

**Settings:**
- **Block List property** - Select the Block List property on your document type
- **Block List element type** - Select the element type used for content blocks within the Block List
- **Content property** - Select the property on the element type where the markdown content will be stored

Each setting has a "Fetch" button to load the available options from your Umbraco instance. Configure them in order from top to bottom, as each depends on the previous selection.

#### Block Grid

Content is wrapped in an Umbraco Block Grid structure. Use this when your document type stores content inside a Block Grid property.

**Settings:**
- **Block Grid property** - Select the Block Grid property on your document type
- **Block Grid element type** - Select the element type used for content blocks within the Block Grid
- **Content property** - Select the property on the element type where the markdown content will be stored

Configuration works the same as Block List mode. Column span and row span are determined by your Block Grid configuration in Umbraco.

## Publishing

Once configured, you can publish the currently active markdown note to Umbraco in two ways:

1. **Ribbon icon** - Click the umbPublisher icon in the left sidebar
2. **Command palette** - Open the command palette (`Ctrl/Cmd + P`) and run "Push to Umbraco"

The plugin will:
- Parse the markdown content from your active note
- Upload any embedded local images to the Umbraco media library, into an "Obsidian" folder
  - Both Obsidian embeds (`![[image.png]]`, including `|400` sizing and `#subpath` suffixes) and standard markdown images (`![alt](images/image.png)`) are supported
  - Each embed is replaced with an `<img>` tag pointing at the uploaded media, and images already in the media library are reused rather than re-uploaded
  - Images already hosted elsewhere (`http(s)://`, `data:`) are left untouched, and anything that fails to upload is reported in a notice
- Create a new document in Umbraco under your configured parent node

## Upgrading from v1.3.x

If you previously used the "Use Block List" toggle, your settings will be automatically migrated to the new content mode system on first load. No action is required - `useBlockList: true` becomes "Block List" mode, and `useBlockList: false` becomes "Property Editor" mode.

## Contributions

All contributions are welcome. This project is written in Typescript and is Open Source. If you have features you'd like added, feel free to create a new [issue](https://github.com/OwainWilliams/umbPublisher/issues).
