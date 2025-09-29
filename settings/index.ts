import umbpublisher from "main";
import { App, PluginSettingTab, Setting, requestUrl, Notice } from "obsidian";
import { GetAllowedChildDocTypes, GetUmbracoDocTypeById } from "methods/getUmbracoDocType";

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
        return (response.json as any).access_token;
    } catch (e) {
        new Notice('Failed to fetch bearer token');
        return null;
    }
}


// Recursively fetch all nodes and their children
async function fetchAllContentNodes(
    websiteUrl: string,
    token: string,
    parentId: string | null = null,
    depth: number = 0
): Promise<any[]> {
    const endpoint = parentId
        ? `${websiteUrl}/umbraco/management/api/v1/tree/document/children?parentId=${parentId}`
        : `${websiteUrl}/umbraco/management/api/v1/tree/document/root?skip=0&take=100&foldersOnly=false`;

    const response = await requestUrl({
        url: endpoint,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    });

    const items = (response.json as any).items || [];
    let allNodes: any[] = [];

    for (const item of items) {
        // Add current node with depth for indentation
        allNodes.push({ ...item, depth });
        // Recursively fetch children
        const children = await fetchAllContentNodes(websiteUrl, token, item.id, depth + 1);
        allNodes = allNodes.concat(children);
    }

    return allNodes;
}

export class SettingTab extends PluginSettingTab {
    plugin: umbpublisher;
    private cachedNodes: any[] = []; // Store fetched nodes
    private cachedAllowedChildDocTypes: any[] = []; // Store fetched allowed child document types

    constructor(app: App, plugin: umbpublisher) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let parentNodeDropdown: HTMLSelectElement | null = null;
        let fetchButton: HTMLButtonElement | null = null;
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Website URL')
            .setDesc('The URL of the Umbraco website e.g. https://example.com')
            .addText(text => text
                .setPlaceholder('Enter the website URL')
                .setValue(this.plugin.settings.websiteUrl)
                .onChange(async (value) => {
                    const match = value.match(/^(https?:\/\/[^\/]+)/i);
        			const sanitized = match ? match[1] : value.replace(/\/.*$/, '');
        			this.plugin.settings.websiteUrl = sanitized;
					await this.plugin.saveSettings();
				})),
			new Setting(containerEl)
				.setName('Client ID')
				.setDesc('The client ID for the Umbraco API')
				.addText(text => text
					.setPlaceholder('Client ID from Umbraco')
					.setValue(this.plugin.settings.clientId)
					.onChange(async (value) => {
						this.plugin.settings.clientId = value;
						await this.plugin.saveSettings();
					})),
			new Setting(containerEl)
				.setName('Client secret')
				.setDesc('The client secret for the Umbraco API')
				.addText(text => text
					.setPlaceholder('Client secret from Umbraco')
					.setValue(this.plugin.settings.clientSecret)
					.onChange(async (value) => {
						this.plugin.settings.clientSecret = value;
						await this.plugin.saveSettings();
					}).inputEl.setAttribute('type', 'password')),
			 new Setting(containerEl)
            .setName('Pick content parent node')
            .setDesc('Fetch and select a parent node from Umbraco where content will be saved under')
            .addButton(button => {
                fetchButton = button.buttonEl;
                button.setButtonText('Fetch nodes').onClick(async () => {
                    const { websiteUrl, clientId, clientSecret } = this.plugin.settings;
                    if (!websiteUrl || !clientId || !clientSecret) {
                        new Notice('Please enter Website URL, Client Id, and Client Secret first.');
                        return;
                    }
                    const token = await getBearerToken(websiteUrl, clientId, clientSecret);
                    if (!token) return;
                    // Fetch all nodes recursively and cache them
                    this.cachedNodes = await fetchAllContentNodes(websiteUrl, token);
                    if (parentNodeDropdown) {
                        parentNodeDropdown.innerHTML = '';
                        const rootOption = document.createElement('option');
                        rootOption.value = '';
                        rootOption.text = '[Select Node]';
                        parentNodeDropdown.appendChild(rootOption);
                        this.cachedNodes.forEach(node => {
                            const option = document.createElement('option');
                            option.value = node.id;
                            option.text = `${'—'.repeat(node.depth)} ${node.variants[0].name}`;
                            parentNodeDropdown?.appendChild(option);
                        });
                        parentNodeDropdown.value = this.plugin.settings.blogParentNodeId || '';
                    }
                });
            })
            .addDropdown(dropdown => {
                parentNodeDropdown = dropdown.selectEl;
                // Populate dropdown from cache if available
                parentNodeDropdown.innerHTML = '';
                const rootOption = document.createElement('option');
                rootOption.value = '';
                rootOption.text = '[Select Node]';
                parentNodeDropdown.appendChild(rootOption);
                if (this.cachedNodes.length > 0) {
                    this.cachedNodes.forEach(node => {
                        const option = document.createElement('option');
                        option.value = node.id;
                        option.text = `${'—'.repeat(node.depth)} ${node.variants[0].name}`;
                        parentNodeDropdown?.appendChild(option);
                    });
                }
                parentNodeDropdown.value = this.plugin.settings.blogParentNodeId || '';

                dropdown.onChange(async (value) => {
                    this.plugin.settings.blogParentNodeId = value;
                    await this.plugin.saveSettings();
                    
                    // Refresh the display to show/hide the allowed child doc types dropdown
                    this.display();
                });
                
            });

        // Only show the allowed child document types dropdown if a parent node is selected
        if (this.plugin.settings.blogParentNodeId) {
            let childDocTypeDropdown: HTMLSelectElement | null = null;
            let fetchChildDocTypesButton: HTMLButtonElement | null = null;

            new Setting(containerEl)
                .setName('Allowed child document types')
                .setDesc('Select the document type for new content items')
                .addButton(button => {
                    fetchChildDocTypesButton = button.buttonEl;
                    button.setButtonText('Fetch child doc types').onClick(async () => {
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

                        // Fetch allowed child document types
                        this.cachedAllowedChildDocTypes = await GetAllowedChildDocTypes(
                            selectedNode.documentType.id, 
                            websiteUrl, 
                            token
                        );

                        console.log('Fetched allowed child doc types:', this.cachedAllowedChildDocTypes);

                        if (childDocTypeDropdown) {
                            childDocTypeDropdown.innerHTML = '';
                            const defaultOption = document.createElement('option');
                            defaultOption.value = '';
                            defaultOption.text = '[Select Document Type]';
                            childDocTypeDropdown.appendChild(defaultOption);

                            this.cachedAllowedChildDocTypes.forEach(docType => {
                                const option = document.createElement('option');
                                option.value = docType.id;
                                option.text = docType.name;
                                childDocTypeDropdown?.appendChild(option);
                            });

                            childDocTypeDropdown.value = this.plugin.settings.blogDocTypeId || '';
                        }
                    });
                })
                .addDropdown(dropdown => {
                    childDocTypeDropdown = dropdown.selectEl;
                    
                    // Populate dropdown from cache if available
                    childDocTypeDropdown.innerHTML = '';
                    const defaultOption = document.createElement('option');
                    defaultOption.value = '';
                    defaultOption.text = '[Select Document Type]';
                    childDocTypeDropdown.appendChild(defaultOption);

                    if (this.cachedAllowedChildDocTypes.length > 0) {
                        this.cachedAllowedChildDocTypes.forEach(docType => {
                            const option = document.createElement('option');
                            option.value = docType.id;
                            option.text = docType.name;
                            childDocTypeDropdown?.appendChild(option);
                        });
                    }

                    childDocTypeDropdown.value = this.plugin.settings.blogDocTypeId || '';

                    dropdown.onChange(async (value) => {
                        console.log('Document type dropdown changed:', value);
                        
                        if (value) {
                            // Get the bearer token
                            const { websiteUrl, clientId, clientSecret } = this.plugin.settings;
                            const token = await getBearerToken(websiteUrl, clientId, clientSecret);
                            
                            if (token) {
                                // Fetch the full document type details to get the alias
                                const docTypeDetails = await GetUmbracoDocTypeById(value, websiteUrl, token);
                                console.log('Document type details:', docTypeDetails);
                                
                                if (docTypeDetails) {
                                    this.plugin.settings.blogDocTypeId = docTypeDetails.id;
                                    this.plugin.settings.blogDocTypeAlias = docTypeDetails.alias;
                                    console.log('Updated settings:', this.plugin.settings.blogDocTypeId, this.plugin.settings.blogDocTypeAlias);
                                }
                            }
                        } else {
                            this.plugin.settings.blogDocTypeId = '';
                            this.plugin.settings.blogDocTypeAlias = '';
                        }
                        
                        await this.plugin.saveSettings();
                        
                        // Refresh the display to update the DocType alias field
                        this.display();
                    });
                });
        }

        new Setting(containerEl)
				.setName('Blog parent node UUID')
				.setDesc('For reference, this is fetched from the node picker above')
				.addText(text => text
					.setPlaceholder('Fetched from node picker above')
					.setValue(this.plugin.settings.blogParentNodeId)
					.setDisabled(true)
					),
			new Setting(containerEl)
				.setName('DocType alias')
				.setDesc('This is automatically populated from the selected child document type above')
				.addText(text => text
					.setPlaceholder('Select a child document type above')
					.setValue(this.plugin.settings.blogDocTypeAlias)
					.setDisabled(true)
					),
			new Setting(containerEl)
				.setName('Title alias')
				.setDesc('This should be an Umbraco.TextString property on your page')
				.addText(text => text
					.setPlaceholder('Enter the Title alias')
					.setValue(this.plugin.settings.titleAlias)
					.onChange(async (value) => {
					 this.plugin.settings.titleAlias = value;
						await this.plugin.saveSettings();
					})),
			new Setting(containerEl)
				.setName('Blog content editor alias')
				.setDesc('This should be an Umbraco.MarkdownEditor property on your page')
				.addText(text => text
					.setPlaceholder('Enter the Property alias')
					.setValue(this.plugin.settings.blogContentAlias)
					.onChange(async (value) => {
						this.plugin.settings.blogContentAlias = value;
						await this.plugin.saveSettings();
					}));
	}
}
