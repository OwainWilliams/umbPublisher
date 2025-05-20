/* eslint-disable @typescript-eslint/no-var-requires */

import { Editor, MarkdownView, Notice, Plugin, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, UmbracidianSettings } from "./types/index";
import { SettingTab } from "./settings";
import { UmbracidianIcons } from "./icons/icons";
import { GetUmbracoDocType } from "./methods/getUmbracoDocType";
import { CallUmbracoApi } from "./methods/callUmbracoApi";
import { GenerateGuid } from 'methods/generateGuid';
import { GetUmbracoSiteNodes } from 'methods/getUmbracoSiteNodes';
const matter = require("gray-matter");


interface Frontmatter {
	title: string;
	tags: string[];
	featured: boolean;
	status: string;
	excerpt?: string;
	feature_image?: string;
	content: string;
}

export default class Umbracidian extends Plugin {
	settings: UmbracidianSettings;

	private icons = new UmbracidianIcons();
	private bearerToken: null | string = null; // Initialize bearerToken to null

	async onload() {
		await this.loadSettings();

		this.icons.registerIcons();
		// This creates an icon in the left ribbon.
		this.addRibbonIcon('umbracidian-logo', 'Umbracidian', async (evt: MouseEvent) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice('No active Markdown view found.');
				return;
			}
			this.bearerToken = await this.getBearerToken();

		//	const umbracoDocType = await GetUmbracoDocType(this.settings.blogDocTypeAlias, this.settings.websiteUrl, this.bearerToken);
			
		//	await this.createObsidianNode(view, umbracoDocType, this.settings.websiteUrl);

		await GetUmbracoSiteNodes(this.settings.blogDocTypeAlias, this.settings.websiteUrl, this.bearerToken);

		});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'push-to-umbraco',
			name: 'Push to Umbraco command',
			editorCallback: async (editor: Editor) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					new Notice('No active Markdown view found.');
					return;
				}
				this.bearerToken = await this.getBearerToken();
				
				const umbracoDocType = await GetUmbracoDocType(this.settings.blogDocTypeAlias, this.settings.websiteUrl, this.bearerToken);
				await this.createObsidianNode(view, umbracoDocType, this.settings.websiteUrl);
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
	
			// Check if the response contains valid JSON
			if (response.json) {
				const data = response.json as { access_token: string };
			//	console.log('Bearer token response:', data);
				return data.access_token; // Assuming the token is in the "access_token" field
			} else {
			//	console.error('Empty or invalid JSON response:', response);
				new Notice('Failed to fetch bearer token.');
				return null;
			}
		} catch (error) {
		//	console.error('Error fetching bearer token:', error);
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

		const metaMatter = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
		const pageContent = matter(view.getViewData());
		
		const frontmatter = {
			title: metaMatter?.title || view.file?.basename,
			tags: metaMatter?.tags || [],
			featured: metaMatter?.featured || false,
			status: metaMatter?.published ? "published" : "draft",
			excerpt: metaMatter?.excerpt || undefined,
			feature_image: metaMatter?.feature_image || undefined,
			content: pageContent.content,
		};
		if (!frontmatter) {
			new Notice('No frontmatter found.');
			return null;
		}
		else {
		//	console.log('Meta matter:', frontmatter);
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
		const endpoint = `${websiteUrl}/umbraco/management/api/v1/document`;
		const nodeId = obsidianDoctype;
	
		const pageTitle = await this.getLeafTitle();
		const pageContent = await this.getPageContent(view);
	
		const body = {
			"id": await GenerateGuid(),
			"parent": this.settings.blogParentNodeId ? { "id": this.settings.blogParentNodeId } : null,
			"documentType":	{ "id": nodeId.id },
			"template": null,
			"values":
				[
					{
						"editorAlias": "Umbraco.TextBox",
						"alias": this.settings.titleAlias,
						"culture": null,
						"segment": null,
						"value": pageTitle
					},
					{
						"editorAias": "Umbraco.MarkdownEditor",
						"alias": this.settings.blogContentAlias,
						"culture": null,
						"segment": null,
						"value": pageContent?.content
	
	
					}
				],
			"variants":
				[
					{
						"culture": null,
						"segment": null,
						"state": null,
						"name": pageTitle,
						"publishDate": null,
						"createDate": null,
						"updateDate": null
					},
				]
	
		};
	
		const token = this.bearerToken;
		
		if (!token) {
			new Notice('Bearer token is null. Please check your settings.');
			return;
		}
	
		try{
			const response = await CallUmbracoApi(endpoint, token, 'POST', body);
			if (response != null) {
				new Notice('Node created successfully!');
			} else {
				new Notice('Failed to create node.');
			}
		}
		catch (error) {
			new Notice('Error creating node: ' + error.message);
		}
		
	}
}
