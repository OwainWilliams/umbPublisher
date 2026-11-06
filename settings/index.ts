import umbpublisher from "main";
import { App, PluginSettingTab, Setting, SettingDefinitionItem, requestUrl, Notice } from "obsidian";
import { GetAllowedChildDocTypes, GetUmbracoDocTypeById } from "methods/getUmbracoDocType";
import { GetBlockListElementTypes, GetElementTypeById } from "methods/getElementType";
import { TokenResponse, UmbracoContentNode, UmbracoAllowedChildDocType, UmbracoElementTypeSummary, UmbracoProperty, umbpublisherSettings } from "../types/index";

async function getBearerToken(websiteUrl: string, clientId: string, clientSecret: string): Promise<string | null> {
    const tokenEndpoint = `${websiteUrl}/umbraco/management/api/v1/security/back-office/token`;
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
    });
    try {
        const response = await requestUrl({
            url: tokenEndpoint,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        return (response.json as TokenResponse).access_token;
    } catch {
        new Notice('Failed to fetch bearer token');
        return null;
    }
}


// Recursively fetch all nodes and their children
async function fetchAllContentNodes(
    websiteUrl: string,
    token: string,
    parentId: string | null = null,
    depth = 0
): Promise<UmbracoContentNode[]> {
    const endpoint = parentId
        ? `${websiteUrl}/umbraco/management/api/v1/tree/document/children?parentId=${parentId}`
        : `${websiteUrl}/umbraco/management/api/v1/tree/document/root?skip=0&take=100&foldersOnly=false`;

    const response = await requestUrl({
        url: endpoint,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });

    const items = (response.json as { items?: UmbracoContentNode[] }).items || [];
    let allNodes: UmbracoContentNode[] = [];

    for (const item of items) {
        // Add current node with depth for indentation
        allNodes.push({ ...item, depth });
        // Recursively fetch children
        const children = await fetchAllContentNodes(websiteUrl, token, item.id, depth + 1);
        allNodes = allNodes.concat(children);
    }

    return allNodes;
}

/** Keeps only the scheme and host, e.g. "https://example.com/umbraco" -> "https://example.com". */
function sanitizeWebsiteUrl(value: string): string {
    const match = value.match(/^(https?:\/\/[^/]+)/i);
    return match ? match[1] : value.replace(/\/.*$/, '');
}

interface SelectOption {
    value: string;
    text: string;
}

/** Settings that hold a document type property alias picked from a dropdown. */
type PropertyAliasKey = 'titleAlias' | 'blogContentAlias' | 'blockPropertyAlias' | 'tagsAlias' | 'descriptionAlias';

/**
 * Settings tab built with Obsidian's declarative settings API (1.13+), so every
 * setting is indexed by Obsidian's settings search.
 *
 * Simple values use built-in controls. Rows that depend on data fetched from
 * Umbraco use `render` callbacks; their dropdowns are kept on the instance so
 * a "Fetch" button in one row can refill dropdowns in another.
 */
export class SettingTab extends PluginSettingTab {
    plugin: umbpublisher;
    private cachedNodes: UmbracoContentNode[] = [];
    private cachedAllowedChildDocTypes: UmbracoAllowedChildDocType[] = [];
    private cachedBlockListElementTypes: UmbracoElementTypeSummary[] = [];
    private cachedElementTypeProperties: UmbracoProperty[] = [];
    private cachedDocTypeProperties: UmbracoProperty[] = [];

    // Dropdowns from the current render, refilled in place by the "Fetch" buttons
    private parentNodeSelect: HTMLSelectElement | null = null;
    private childDocTypeSelect: HTMLSelectElement | null = null;
    private elementTypeSelect: HTMLSelectElement | null = null;
    private blockContentPropertySelect: HTMLSelectElement | null = null;
    private propertySelects: Partial<Record<PropertyAliasKey, HTMLSelectElement>> = {};

    constructor(app: App, plugin: umbpublisher) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const settings = (): umbpublisherSettings => this.plugin.settings;
        const isBlockMode = () => settings().contentMode === 'blockList' || settings().contentMode === 'blockGrid';
        const modeLabel = settings().contentMode === 'blockGrid' ? 'Block Grid' : 'Block List';

        return [
            {
                type: 'group',
                heading: 'Umbraco connection',
                items: [
                    {
                        name: 'Website URL',
                        desc: 'The URL of the Umbraco website e.g. https://example.com',
                        aliases: ['url', 'site', 'domain', 'umbraco'],
                        control: { type: 'text', key: 'websiteUrl', placeholder: 'Enter the website URL' },
                    },
                    {
                        name: 'Client ID',
                        desc: 'The client ID for the Umbraco API',
                        aliases: ['api', 'credentials', 'api user'],
                        control: { type: 'text', key: 'clientId', placeholder: 'Client ID from Umbraco' },
                    },
                    {
                        name: 'Client secret',
                        desc: 'The client secret for the Umbraco API',
                        aliases: ['api', 'credentials', 'password'],
                        render: (setting) => this.renderClientSecret(setting),
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Content location',
                items: [
                    {
                        name: 'Pick content parent node',
                        desc: 'Fetch and select a parent node from Umbraco where content will be saved under',
                        aliases: ['parent', 'node', 'content tree', 'location'],
                        render: (setting) => this.renderParentNode(setting),
                    },
                    {
                        name: 'Allowed child document types',
                        desc: 'Select the document type for new content items',
                        aliases: ['document type', 'doc type'],
                        visible: () => !!settings().blogParentNodeId,
                        render: (setting) => this.renderChildDocType(setting),
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Content mode',
                items: [
                    {
                        name: 'Content mode',
                        desc: 'How content is stored on the document type in Umbraco',
                        aliases: ['property editor', 'block list', 'block grid'],
                        control: {
                            type: 'dropdown',
                            key: 'contentMode',
                            options: {
                                propertyEditor: 'Property Editor',
                                blockList: 'Block List',
                                blockGrid: 'Block Grid',
                            },
                        },
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Property Editor',
                visible: () => settings().contentMode === 'propertyEditor' && !!settings().blogDocTypeId,
                items: [
                    {
                        name: 'Fetch document type properties',
                        desc: 'Load properties from your document type to select title and content aliases',
                        aliases: ['properties'],
                        render: (setting) => {
                            setting.addButton(button => button
                                .setButtonText('Fetch properties')
                                .onClick(() => this.fetchDocTypeProperties()));
                        },
                    },
                    {
                        name: 'Title property',
                        desc: 'Select the title property on your document type',
                        aliases: ['title'],
                        render: (setting) => this.addPropertyDropdown(setting, 'titleAlias', '[Select Property]'),
                    },
                    {
                        name: 'Content property',
                        desc: 'Select the content/markdown property on your document type',
                        aliases: ['content', 'markdown', 'body'],
                        render: (setting) => this.addPropertyDropdown(setting, 'blogContentAlias', '[Select Property]'),
                    },
                ],
            },
            {
                type: 'group',
                heading: modeLabel,
                visible: () => isBlockMode() && !!settings().blogDocTypeId,
                items: [
                    {
                        name: `${modeLabel} property`,
                        desc: `Select the ${modeLabel} property on your document type`,
                        aliases: ['block', 'block list', 'block grid'],
                        render: (setting) => {
                            setting.addButton(button => button
                                .setButtonText('Fetch properties')
                                .onClick(() => this.fetchDocTypeProperties()));
                            this.addPropertyDropdown(setting, 'blockPropertyAlias', '[Select Property]');
                        },
                    },
                    {
                        name: `${modeLabel} element type`,
                        desc: 'Select the element type to use for content blocks',
                        aliases: ['element type', 'block'],
                        render: (setting) => this.renderElementType(setting),
                    },
                    {
                        name: 'Content property',
                        desc: 'Select the property on the element type where content will be stored',
                        aliases: ['content', 'markdown', 'body', 'element'],
                        visible: () => !!settings().blockElementTypeId,
                        render: (setting) => this.renderBlockContentProperty(setting),
                    },
                ],
            },
            {
                type: 'group',
                heading: 'Optional properties',
                visible: () => !!settings().blogDocTypeId,
                items: [
                    {
                        name: 'Tags property',
                        desc: 'Select the tags property on your document type (optional)',
                        aliases: ['tags', 'frontmatter'],
                        render: (setting) => this.addPropertyDropdown(setting, 'tagsAlias', '[None]'),
                    },
                    {
                        name: 'Description property',
                        desc: 'Select the property for the note\'s frontmatter description (optional). Sent as plain text to a text area, markdown or rich text property.',
                        aliases: ['description', 'summary', 'frontmatter'],
                        render: (setting) => this.addPropertyDropdown(setting, 'descriptionAlias', '[None]'),
                    },
                ],
            },
        ];
    }

    /**
     * Persists built-in control values through the plugin so its services are
     * re-initialised with the new settings.
     */
    async setControlValue(key: string, value: unknown): Promise<void> {
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        settings[key] = key === 'websiteUrl' && typeof value === 'string' ? sanitizeWebsiteUrl(value) : value;
        await this.plugin.saveSettings();

        // Headings and row names depend on the mode, so rebuild the definitions
        if (key === 'contentMode') {
            this.update();
        }
    }

    // ------------------------------------------------------------------ rows

    private renderClientSecret(setting: Setting): void {
        setting.addText(text => {
            text
                .setPlaceholder('Client secret from Umbraco')
                .setValue(this.plugin.settings.clientSecret)
                .onChange(async (value) => {
                    this.plugin.settings.clientSecret = value;
                    await this.plugin.saveSettings();
                });
            text.inputEl.setAttribute('type', 'password');
        });
    }

    private renderParentNode(setting: Setting): void {
        setting
            .addButton(button => button.setButtonText('Fetch nodes').onClick(async () => {
                const { websiteUrl, clientId, clientSecret } = this.plugin.settings;
                if (!websiteUrl || !clientId || !clientSecret) {
                    new Notice('Please enter Website URL, Client Id, and Client Secret first.');
                    return;
                }
                const token = await getBearerToken(websiteUrl, clientId, clientSecret);
                if (!token) return;

                this.cachedNodes = await fetchAllContentNodes(websiteUrl, token);
                this.fillSelect(this.parentNodeSelect, '[Select Node]', this.nodeOptions(), this.plugin.settings.blogParentNodeId);
            }))
            .addDropdown(dropdown => {
                this.parentNodeSelect = dropdown.selectEl;
                this.fillSelect(dropdown.selectEl, '[Select Node]', this.nodeOptions(), this.plugin.settings.blogParentNodeId);

                dropdown.onChange(async (value) => {
                    this.plugin.settings.blogParentNodeId = value;
                    await this.plugin.saveSettings();
                    // Show or hide the allowed child doc types row
                    this.update();
                });
            });
    }

    private renderChildDocType(setting: Setting): void {
        setting
            .addButton(button => button.setButtonText('Fetch child doc types').onClick(async () => {
                const { websiteUrl, clientId, clientSecret, blogParentNodeId } = this.plugin.settings;
                if (!websiteUrl || !clientId || !clientSecret || !blogParentNodeId) {
                    new Notice('Please ensure all required settings are configured.');
                    return;
                }

                const token = await getBearerToken(websiteUrl, clientId, clientSecret);
                if (!token) return;

                // Find the selected parent node to get its document type ID
                const selectedNode = this.cachedNodes.find(node => node.id === blogParentNodeId);
                if (!selectedNode) {
                    new Notice('Selected parent node not found. Please re-fetch nodes.');
                    return;
                }

                this.cachedAllowedChildDocTypes = await GetAllowedChildDocTypes(
                    selectedNode.documentType.id,
                    websiteUrl,
                    token
                );
                this.fillSelect(this.childDocTypeSelect, '[Select Document Type]', this.childDocTypeOptions(), this.plugin.settings.blogDocTypeId);
            }))
            .addDropdown(dropdown => {
                this.childDocTypeSelect = dropdown.selectEl;
                this.fillSelect(dropdown.selectEl, '[Select Document Type]', this.childDocTypeOptions(), this.plugin.settings.blogDocTypeId);

                dropdown.onChange(async (value) => {
                    if (value) {
                        const { websiteUrl, clientId, clientSecret } = this.plugin.settings;
                        const token = await getBearerToken(websiteUrl, clientId, clientSecret);

                        if (token) {
                            // Fetch the full document type details to get the alias
                            const docTypeDetails = await GetUmbracoDocTypeById(value, websiteUrl, token);

                            if (docTypeDetails) {
                                if (docTypeDetails.id && docTypeDetails.alias) {
                                    this.plugin.settings.blogDocTypeId = docTypeDetails.id;
                                    this.plugin.settings.blogDocTypeAlias = docTypeDetails.alias;
                                } else {
                                    new Notice('Selected document type is missing required fields (id/alias).');
                                    return;
                                }
                            }
                        }
                    } else {
                        this.plugin.settings.blogDocTypeId = '';
                        this.plugin.settings.blogDocTypeAlias = '';
                    }

                    await this.plugin.saveSettings();
                    // Show or hide the mode-specific and optional property rows
                    this.update();
                });
            });
    }

    private renderElementType(setting: Setting): void {
        setting
            .addButton(button => button.setButtonText('Fetch element types').onClick(async () => {
                const { websiteUrl, clientId, clientSecret, blogDocTypeId, blockPropertyAlias } = this.plugin.settings;

                if (!websiteUrl || !clientId || !clientSecret || !blogDocTypeId || !blockPropertyAlias) {
                    new Notice('Please configure all required settings first.');
                    return;
                }

                const token = await getBearerToken(websiteUrl, clientId, clientSecret);
                if (!token) return;

                this.cachedBlockListElementTypes = await GetBlockListElementTypes(
                    blogDocTypeId,
                    blockPropertyAlias,
                    websiteUrl,
                    token
                );
                this.fillSelect(this.elementTypeSelect, '[Select Element Type]', this.elementTypeOptions(), this.plugin.settings.blockElementTypeId);
            }))
            .addDropdown(dropdown => {
                this.elementTypeSelect = dropdown.selectEl;
                this.fillSelect(dropdown.selectEl, '[Select Element Type]', this.elementTypeOptions(), this.plugin.settings.blockElementTypeId);

                dropdown.onChange(async (value) => {
                    if (value) {
                        const { websiteUrl, clientId, clientSecret } = this.plugin.settings;
                        const token = await getBearerToken(websiteUrl, clientId, clientSecret);

                        if (token) {
                            const elementTypeDetails = await GetElementTypeById(value, websiteUrl, token);

                            if (elementTypeDetails) {
                                if (elementTypeDetails.id && elementTypeDetails.alias) {
                                    this.plugin.settings.blockElementTypeId = elementTypeDetails.id;
                                    this.plugin.settings.blockElementTypeAlias = elementTypeDetails.alias;
                                } else {
                                    new Notice('Selected element type is missing required fields (id/alias).');
                                    return;
                                }
                                this.cachedElementTypeProperties = elementTypeDetails.properties || [];
                            }
                        }
                    } else {
                        this.plugin.settings.blockElementTypeId = '';
                        this.plugin.settings.blockElementTypeAlias = '';
                        this.plugin.settings.blockContentPropertyAlias = '';
                        this.cachedElementTypeProperties = [];
                    }

                    await this.plugin.saveSettings();
                    // Show or hide the element content property row, with fresh options
                    this.update();
                });
            });
    }

    private renderBlockContentProperty(setting: Setting): void {
        setting
            .addButton(button => button.setButtonText('Fetch properties').onClick(async () => {
                const { websiteUrl, clientId, clientSecret, blockElementTypeId } = this.plugin.settings;

                if (!blockElementTypeId) {
                    new Notice('Please select an element type first.');
                    return;
                }

                const token = await getBearerToken(websiteUrl, clientId, clientSecret);
                if (!token) return;

                const elementTypeDetails = await GetElementTypeById(blockElementTypeId, websiteUrl, token);
                if (elementTypeDetails) {
                    this.cachedElementTypeProperties = elementTypeDetails.properties || [];
                }
                this.fillSelect(this.blockContentPropertySelect, '[Select Property]', this.propertyOptions(this.cachedElementTypeProperties), this.plugin.settings.blockContentPropertyAlias);
            }))
            .addDropdown(dropdown => {
                this.blockContentPropertySelect = dropdown.selectEl;
                this.fillSelect(dropdown.selectEl, '[Select Property]', this.propertyOptions(this.cachedElementTypeProperties), this.plugin.settings.blockContentPropertyAlias);

                dropdown.onChange(async (value) => {
                    this.plugin.settings.blockContentPropertyAlias = value;
                    await this.plugin.saveSettings();
                });
            });
    }

    /**
     * Adds a dropdown of the cached document type properties, bound to a settings key.
     * The placeholder is "[Select Property]" for required pickers and "[None]" for optional ones.
     */
    private addPropertyDropdown(setting: Setting, key: PropertyAliasKey, placeholder: string): void {
        setting.addDropdown(dropdown => {
            this.propertySelects[key] = dropdown.selectEl;
            this.fillSelect(dropdown.selectEl, placeholder, this.propertyOptions(this.cachedDocTypeProperties), this.plugin.settings[key]);

            dropdown.onChange(async (value) => {
                this.plugin.settings[key] = value;
                await this.plugin.saveSettings();
            });
        });
    }

    // ------------------------------------------------------------------ data

    /**
     * Fetches the document type's properties (including compositions) and refills
     * every document type property dropdown on the tab.
     */
    private async fetchDocTypeProperties(): Promise<void> {
        const { websiteUrl, clientId, clientSecret, blogDocTypeId } = this.plugin.settings;

        if (!blogDocTypeId) {
            new Notice('Please select a document type first.');
            return;
        }

        const token = await getBearerToken(websiteUrl, clientId, clientSecret);
        if (!token) return;

        const allProps = await this.fetchAllDocTypeProperties(blogDocTypeId, websiteUrl, token);
        if (allProps.length === 0) {
            new Notice('Failed to fetch document type.');
            return;
        }

        this.cachedDocTypeProperties = allProps;

        const options = this.propertyOptions(allProps);
        const placeholders: Record<PropertyAliasKey, string> = {
            titleAlias: '[Select Property]',
            blogContentAlias: '[Select Property]',
            blockPropertyAlias: '[Select Property]',
            tagsAlias: '[None]',
            descriptionAlias: '[None]',
        };
        for (const key of Object.keys(placeholders) as PropertyAliasKey[]) {
            this.fillSelect(this.propertySelects[key] ?? null, placeholders[key], options, this.plugin.settings[key]);
        }
    }

    /**
     * Fetches all properties from a document type including composed document types
     */
    private async fetchAllDocTypeProperties(docTypeId: string, websiteUrl: string, token: string): Promise<UmbracoProperty[]> {
        const docTypeDetails = await GetUmbracoDocTypeById(docTypeId, websiteUrl, token);
        if (!docTypeDetails) {
            return [];
        }

        let allProps: UmbracoProperty[] = docTypeDetails.properties || [];
        if (docTypeDetails.compositions) {
            for (const comp of docTypeDetails.compositions) {
                if (comp.properties) {
                    allProps = allProps.concat(comp.properties);
                }
                const compId = comp.documentType?.id || comp.id;
                if (compId) {
                    const compDetails = await GetUmbracoDocTypeById(compId, websiteUrl, token);
                    if (compDetails?.properties) {
                        allProps = allProps.concat(compDetails.properties);
                    }
                }
            }
        }

        return allProps;
    }

    private nodeOptions(): SelectOption[] {
        return this.cachedNodes.map(node => ({
            value: node.id,
            text: `${'—'.repeat(node.depth)} ${node.variants[0].name}`,
        }));
    }

    private childDocTypeOptions(): SelectOption[] {
        return this.cachedAllowedChildDocTypes.map(docType => ({ value: docType.id, text: docType.name }));
    }

    private elementTypeOptions(): SelectOption[] {
        return this.cachedBlockListElementTypes.map(elementType => ({
            value: elementType.id,
            text: elementType.name || elementType.alias,
        }));
    }

    private propertyOptions(properties: UmbracoProperty[]): SelectOption[] {
        return properties.map(prop => ({ value: prop.alias, text: prop.name || prop.alias }));
    }

    /** Replaces a dropdown's options with a placeholder plus the given options, then restores the selection. */
    private fillSelect(selectEl: HTMLSelectElement | null, placeholder: string, options: SelectOption[], selected: string): void {
        if (!selectEl) return;

        selectEl.empty();
        selectEl.createEl('option', { value: '', text: placeholder });
        for (const option of options) {
            selectEl.createEl('option', { value: option.value, text: option.text });
        }
        selectEl.value = selected || '';
    }
}
