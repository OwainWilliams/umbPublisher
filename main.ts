/* eslint-disable @typescript-eslint/no-var-requires */

import { Editor, MarkdownView, Notice, Plugin, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, umbpublisherSettings } from "./types/index";
import { SettingTab } from "./settings";
import { umbpublisherIcons } from "./icons/icons";
import { GetUmbracoDocTypeById } from "./methods/getUmbracoDocType";
import { CallUmbracoApi } from "./methods/callUmbracoApi";
import { GenerateGuid } from 'methods/generateGuid';



interface Frontmatter {
	title: string;
	tags: string[];
	featured: boolean;
	status: string;
	excerpt?: string;
	feature_image?: string;
	content: string;
}

export default class umbpublisher extends Plugin {
	settings: umbpublisherSettings;

	private icons = new umbpublisherIcons();
	private bearerToken: null | string = null; // Initialize bearerToken to null

	async onload() {
		await this.loadSettings();

		this.icons.registerIcons();
		// This creates an icon in the left ribbon.
		this.addRibbonIcon('umbpublisher-logo', 'umbpublisher', async (evt: MouseEvent) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice('No active Markdown view found.');
				return;
			}
			this.bearerToken = await this.getBearerToken();
			console.log('Blog DocType Id:', this.settings.blogDocTypeId);

			const umbracoDocType = await GetUmbracoDocTypeById(this.settings.blogDocTypeId, this.settings.websiteUrl, this.bearerToken);
			
			console.log('Document type fetched ICON:', umbracoDocType);

			if (!umbracoDocType) {
				new Notice('Failed to get document type. Please check your settings.');
				return;
			}
			
			await this.createObsidianNode(view, umbracoDocType, this.settings.websiteUrl);

		});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'push-to-umbraco',
			name: 'Push to Umbraco',
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => 
			{
				if(checking) return true;

				const value = this.app.workspace.getActiveViewOfType(MarkdownView);

				if(!value){
					new Notice('No active Markdown view found.');
					return;
				}
				(async () => {
				this.bearerToken = await this.getBearerToken();
				const umbracoDocType = await GetUmbracoDocTypeById(this.settings.blogDocTypeId, this.settings.websiteUrl, this.bearerToken);
				
				if (!umbracoDocType) {
					new Notice('Failed to get document type. Please check your settings.');
					return;
				}
				
				await this.createObsidianNode(view, umbracoDocType, this.settings.websiteUrl);
				})();
			}
		
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	async getBearerToken(): Promise<string | null> {
		const clientId = this.settings.clientId;
		const clientSecret = this.settings.clientSecret;
		const tokenEndpoint = `${this.settings.websiteUrl}/umbraco/management/api/v1/security/back-office/token`;
	
		if (!clientId || !clientSecret || !tokenEndpoint) {
			new Notice('Missing CLIENT_ID, CLIENT_SECRET, or TOKEN_ENDPOINT in environment variables.');
			return null;
		}
	
		const body = new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: clientId,
			client_secret: clientSecret,
		});
	
		try {
			const response = await requestUrl({
				url: tokenEndpoint,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: body.toString(),
			});
	
			
			if (response.json) {
				const data = response.json as { access_token: string };
			
				return data.access_token;
			} else {
				new Notice('Failed to fetch bearer token.');
				return null;
			}
		} catch (error) {
			new Notice(`Error fetching bearer token: ${error}`);
			return null;
		}
	}

	async getPageContent(view: MarkdownView): Promise<Frontmatter | null> {
		
		const noteFile = view.app.workspace.getActiveFile(); 
		if (!noteFile) {
			new Notice('No active file found.');
			return null;
		}

		const fileCache = this.app.metadataCache.getFileCache(noteFile);
		const metaMatter = fileCache?.frontmatter;
		const fileContent = await this.app.vault.read(noteFile);

		let content = fileContent;
		if (fileCache?.frontmatterPosition) {
			const { start, end } = fileCache.frontmatterPosition;
			const lines = fileContent.split('\n');
			content = lines.slice(end.line + 1).join('\n');
		}

		const frontmatter = {
			title: metaMatter?.title || view.file?.basename,
			tags: metaMatter?.tags || [],
			featured: metaMatter?.featured || false,
			status: metaMatter?.published ? "published" : "draft",
			excerpt: metaMatter?.excerpt || undefined,
			feature_image: metaMatter?.feature_image || undefined,
			content: content,
		};
		if (!frontmatter) {
			new Notice('No frontmatter found.');
			return null;
		}
		else {
			return frontmatter;
		}

	}

	async getLeafTitle(): Promise<string | null> {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && activeLeaf.getDisplayText) {
			return activeLeaf.getDisplayText();
		} else {
			new Notice('No active leaf found.');
			return null;
		}
	}

	async createObsidianNode(view: MarkdownView, obsidianDoctype: any, websiteUrl: string): Promise<void> {
		if (!obsidianDoctype) {
			new Notice('Document type is null. Cannot create node.');
			return;
		}
	
	const validateEndpoint = `${websiteUrl}/umbraco/management/api/v1/document/validate`;
	const createEndpoint = `${websiteUrl}/umbraco/management/api/v1/document`;
	const nodeId = obsidianDoctype.id;

	const pageTitle = await this.getLeafTitle();
	const pageContent = await this.getPageContent(view);
	
	// Validate required data
	if (!pageTitle) {
		new Notice('Failed to get page title.');
		return;
	}
	
	if (!pageContent || !pageContent.content) {
		new Notice('Failed to get page content.');
		return;
	}
	
	if (!nodeId) {
		new Notice('Failed to get document type ID.');
		return;
	}		
		const body = {
			"documentType": {
				"id": nodeId
			},
			"template": null, // Set to null if no specific template, or { "id": "template-guid" } if needed
			"values": [
				{
					"alias": this.settings.titleAlias,
					"culture": null,
					"segment": null,
					"value": pageTitle || ""
				},
				{
					"alias": this.settings.blogContentAlias,
					"culture": null,
					"segment": null,
					"value": pageContent?.content || ""
				}
			],
			"variants": [
				{
					"name": pageTitle,
					"culture": null,
					"segment": null
				}
			],
			"id": await GenerateGuid(),
			"parent": (this.settings.blogParentNodeId && this.settings.blogParentNodeId.trim() !== '' && this.settings.blogParentNodeId !== 'null') 
				? { "id": this.settings.blogParentNodeId } 
				: null
		};

		console.log('Validating Umbraco node with:');
		console.log('Validate Endpoint:', validateEndpoint);
		console.log('Document Type ID:', nodeId);
		console.log('Parent Node ID:', this.settings.blogParentNodeId);
		console.log('Request Body:', JSON.stringify(body, null, 2));
		
		const token = this.bearerToken;
		
		if (!token) {
			new Notice('Bearer token is null. Please check your settings.');
			return;
		}
	    
		try{
			// First, validate the document
			console.log('Validating document...');
			const validateResponse = await CallUmbracoApi(validateEndpoint, token, 'POST', body);
			
			if (validateResponse == null) {
				new Notice('Document validation failed - no response received.');
				return;
			}
			
			console.log('Document validation successful:', validateResponse);
			
			// If validation succeeds, proceed with document creation
			console.log('Creating Umbraco node...');
			const createResponse = await CallUmbracoApi(createEndpoint, token, 'POST', body);
		
			if (createResponse != null) {
				console.log('Node creation successful:', createResponse);
				new Notice('Node created successfully!');
			} else {
				new Notice('Failed to create node - no response received.');
			}
		}
		catch (error) {
			console.error('Error in createObsidianNode:', error);
			if (error.message && error.message.includes('validate')) {
				new Notice('Document validation failed: ' + error.message);
			} else {
				new Notice('Error creating node: ' + error.message);
			}
		}	}
}
