import umbpublisher from "main";
import { App, PluginSettingTab, Setting, requestUrl, Notice } from "obsidian";
import { GetAllowedChildDocTypes, GetUmbracoDocTypeById } from "methods/getUmbracoDocType";
import { GetBlockListElementTypes, GetElementTypeById } from "methods/getElementType";
import { ContentMode, TokenResponse, UmbracoContentNode, UmbracoAllowedChildDocType, UmbracoElementTypeSummary, UmbracoProperty } from "../types/index";

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

export class SettingTab extends PluginSettingTab {
    plugin: umbpublisher;
    private cachedNodes: UmbracoContentNode[] = [];
    private cachedAllowedChildDocTypes: UmbracoAllowedChildDocType[] = [];
    private cachedBlockListElementTypes: UmbracoElementTypeSummary[] = [];
    private cachedElementTypeProperties: UmbracoProperty[] = [];
    private cachedDocTypeProperties: UmbracoProperty[] = [];

    constructor(app: App, plugin: umbpublisher) {
        super(app, plugin);
        this.plugin = plugin;
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
                        const rootOption = createEl('option');
                        rootOption.value = '';
                        rootOption.text = '[Select Node]';
                        parentNodeDropdown.appendChild(rootOption);
                        this.cachedNodes.forEach(node => {
                            const option = createEl('option');
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
                const rootOption = createEl('option');
                rootOption.value = '';
                rootOption.text = '[Select Node]';
                parentNodeDropdown.appendChild(rootOption);
                if (this.cachedNodes.length > 0) {
                    this.cachedNodes.forEach(node => {
                        const option = createEl('option');
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

                        if (childDocTypeDropdown) {
                            childDocTypeDropdown.innerHTML = '';
                            const defaultOption = createEl('option');
                            defaultOption.value = '';
                            defaultOption.text = '[Select Document Type]';
                            childDocTypeDropdown.appendChild(defaultOption);

                            this.cachedAllowedChildDocTypes.forEach(docType => {
                                const option = createEl('option');
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
                    const defaultOption = createEl('option');
                    defaultOption.value = '';
                    defaultOption.text = '[Select Document Type]';
                    childDocTypeDropdown.appendChild(defaultOption);

                    if (this.cachedAllowedChildDocTypes.length > 0) {
                        this.cachedAllowedChildDocTypes.forEach(docType => {
                            const option = createEl('option');
                            option.value = docType.id;
                            option.text = docType.name;
                            childDocTypeDropdown?.appendChild(option);
                        });
                    }

                    childDocTypeDropdown.value = this.plugin.settings.blogDocTypeId || '';

                    dropdown.onChange(async (value) => {
                        if (value) {
                            // Get the bearer token
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
                        
                        // Refresh the display to update the DocType alias field
                        this.display();
                    });
                });
        }

		// Content Mode Selection
		new Setting(containerEl)
			.setName('Content mode')
			.setDesc('How content is stored on the document type in Umbraco')
			.addDropdown(dropdown => {
				dropdown
					.addOption('propertyEditor', 'Property Editor')
					.addOption('blockList', 'Block List')
					.addOption('blockGrid', 'Block Grid')
					.setValue(this.plugin.settings.contentMode)
					.onChange(async (value) => {
						this.plugin.settings.contentMode = value as ContentMode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// Show block settings when Block List or Block Grid mode is selected
		if ((this.plugin.settings.contentMode === 'blockList' || this.plugin.settings.contentMode === 'blockGrid') && this.plugin.settings.blogDocTypeId) {
			const modeLabel = this.plugin.settings.contentMode === 'blockGrid' ? 'Block Grid' : 'Block List';
			this.renderBlockSettings(containerEl, modeLabel);

		}

		// Show legacy settings only when using Property Editor mode
		if (this.plugin.settings.contentMode === 'propertyEditor' && this.plugin.settings.blogDocTypeId) {
			let titleDropdown: HTMLSelectElement | null = null;
			let contentDropdown: HTMLSelectElement | null = null;

			new Setting(containerEl)
				.setName('Fetch document type properties')
				.setDesc('Load properties from your document type to select title and content aliases')
				.addButton(button => {
					button.setButtonText('Fetch properties').onClick(async () => {
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

						// Populate both dropdowns
						for (const dd of [titleDropdown, contentDropdown]) {
							if (!dd) continue;
							const currentVal = dd.value;
							dd.innerHTML = '';
							const defaultOption = createEl('option');
							defaultOption.value = '';
							defaultOption.text = '[Select Property]';
							dd.appendChild(defaultOption);

							this.cachedDocTypeProperties.forEach((prop: any) => {
								const option = createEl('option');
								option.value = prop.alias;
								option.text = prop.name || prop.alias;
								dd.appendChild(option);
							});

							dd.value = currentVal;
						}

						// Restore saved values
						if (titleDropdown) titleDropdown.value = this.plugin.settings.titleAlias || '';
						if (contentDropdown) contentDropdown.value = this.plugin.settings.blogContentAlias || '';
					});
				});

			new Setting(containerEl)
				.setName('Title property')
				.setDesc('Select the title property on your document type')
				.addDropdown(dropdown => {
					titleDropdown = dropdown.selectEl;

					titleDropdown.innerHTML = '';
					const defaultOption = createEl('option');
					defaultOption.value = '';
					defaultOption.text = '[Select Property]';
					titleDropdown.appendChild(defaultOption);

					if (this.cachedDocTypeProperties.length > 0) {
						this.cachedDocTypeProperties.forEach((prop: any) => {
							const option = createEl('option');
							option.value = prop.alias;
							option.text = prop.name || prop.alias;
							titleDropdown?.appendChild(option);
						});
					}

					titleDropdown.value = this.plugin.settings.titleAlias || '';

					dropdown.onChange(async (value) => {
						this.plugin.settings.titleAlias = value;
						await this.plugin.saveSettings();
					});
				});

			new Setting(containerEl)
				.setName('Content property')
				.setDesc('Select the content/markdown property on your document type')
				.addDropdown(dropdown => {
					contentDropdown = dropdown.selectEl;

					contentDropdown.innerHTML = '';
					const defaultOption = createEl('option');
					defaultOption.value = '';
					defaultOption.text = '[Select Property]';
					contentDropdown.appendChild(defaultOption);

					if (this.cachedDocTypeProperties.length > 0) {
						this.cachedDocTypeProperties.forEach((prop: any) => {
							const option = createEl('option');
							option.value = prop.alias;
							option.text = prop.name || prop.alias;
							contentDropdown?.appendChild(option);
						});
					}

					contentDropdown.value = this.plugin.settings.blogContentAlias || '';

					dropdown.onChange(async (value) => {
						this.plugin.settings.blogContentAlias = value;
						await this.plugin.saveSettings();
					});
				});
		}
	}

	/**
	 * Renders the shared block settings (property picker, element type picker, content property picker)
	 * Used by both Block List and Block Grid modes.
	 */
	private renderBlockSettings(containerEl: HTMLElement, modeLabel: string): void {
		let blockPropDropdown: HTMLSelectElement | null = null;

		new Setting(containerEl)
			.setName(`${modeLabel} property`)
			.setDesc(`Select the ${modeLabel} property on your document type`)
			.addButton(button => {
				button.setButtonText('Fetch properties').onClick(async () => {
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

					if (blockPropDropdown) {
						blockPropDropdown.innerHTML = '';
						const defaultOption = createEl('option');
						defaultOption.value = '';
						defaultOption.text = '[Select Property]';
						blockPropDropdown.appendChild(defaultOption);

						this.cachedDocTypeProperties.forEach((prop: any) => {
							const option = createEl('option');
							option.value = prop.alias;
							option.text = prop.name || prop.alias;
							blockPropDropdown?.appendChild(option);
						});

						blockPropDropdown.value = this.plugin.settings.blockPropertyAlias || '';
					}
				});
			})
			.addDropdown(dropdown => {
				blockPropDropdown = dropdown.selectEl;

				blockPropDropdown.innerHTML = '';
				const defaultOption = createEl('option');
				defaultOption.value = '';
				defaultOption.text = '[Select Property]';
				blockPropDropdown.appendChild(defaultOption);

				if (this.cachedDocTypeProperties.length > 0) {
					this.cachedDocTypeProperties.forEach((prop: any) => {
						const option = createEl('option');
						option.value = prop.alias;
						option.text = prop.name || prop.alias;
						blockPropDropdown?.appendChild(option);
					});
				}

				blockPropDropdown.value = this.plugin.settings.blockPropertyAlias || '';

				dropdown.onChange(async (value) => {
					this.plugin.settings.blockPropertyAlias = value;
					await this.plugin.saveSettings();
				});
			});

		let elementTypeDropdown: HTMLSelectElement | null = null;

		new Setting(containerEl)
			.setName(`${modeLabel} element type`)
			.setDesc('Select the element type to use for content blocks')
			.addButton(button => {
				button.setButtonText('Fetch element types').onClick(async () => {
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

					if (elementTypeDropdown) {
						elementTypeDropdown.innerHTML = '';
						const defaultOption = createEl('option');
						defaultOption.value = '';
						defaultOption.text = '[Select Element Type]';
						elementTypeDropdown.appendChild(defaultOption);

						this.cachedBlockListElementTypes.forEach(elementType => {
							const option = createEl('option');
							option.value = elementType.id;
							option.text = elementType.name || elementType.alias;
							elementTypeDropdown?.appendChild(option);
						});

						elementTypeDropdown.value = this.plugin.settings.blockElementTypeId || '';
					}
				});
			})
			.addDropdown(dropdown => {
				elementTypeDropdown = dropdown.selectEl;

				elementTypeDropdown.innerHTML = '';
				const defaultOption = createEl('option');
				defaultOption.value = '';
				defaultOption.text = '[Select Element Type]';
				elementTypeDropdown.appendChild(defaultOption);

				if (this.cachedBlockListElementTypes.length > 0) {
					this.cachedBlockListElementTypes.forEach(elementType => {
						const option = createEl('option');
						option.value = elementType.id;
						option.text = elementType.name || elementType.alias;
						elementTypeDropdown?.appendChild(option);
					});
				}

				elementTypeDropdown.value = this.plugin.settings.blockElementTypeId || '';

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
					this.display();
				});
			});

		// Content property dropdown - shown when element type is selected
		if (this.plugin.settings.blockElementTypeId) {
			let contentPropDropdown: HTMLSelectElement | null = null;

			new Setting(containerEl)
				.setName('Content property')
				.setDesc('Select the property on the element type where content will be stored')
				.addButton(button => {
					button.setButtonText('Fetch properties').onClick(async () => {
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

						if (contentPropDropdown) {
							contentPropDropdown.innerHTML = '';
							const defaultOption = createEl('option');
							defaultOption.value = '';
							defaultOption.text = '[Select Property]';
							contentPropDropdown.appendChild(defaultOption);

							this.cachedElementTypeProperties.forEach((prop: any) => {
								const option = createEl('option');
								option.value = prop.alias;
								option.text = prop.name || prop.alias;
								contentPropDropdown?.appendChild(option);
							});

							contentPropDropdown.value = this.plugin.settings.blockContentPropertyAlias || '';
						}
					});
				})
				.addDropdown(dropdown => {
					contentPropDropdown = dropdown.selectEl;

					contentPropDropdown.innerHTML = '';
					const defaultOption = createEl('option');
					defaultOption.value = '';
					defaultOption.text = '[Select Property]';
					contentPropDropdown.appendChild(defaultOption);

					if (this.cachedElementTypeProperties.length > 0) {
						this.cachedElementTypeProperties.forEach((prop: any) => {
							const option = createEl('option');
							option.value = prop.alias;
							option.text = prop.name || prop.alias;
							contentPropDropdown?.appendChild(option);
						});
					}

					contentPropDropdown.value = this.plugin.settings.blockContentPropertyAlias || '';

					dropdown.onChange(async (value) => {
						this.plugin.settings.blockContentPropertyAlias = value;
						await this.plugin.saveSettings();
					});
				});
		}
	}
}
