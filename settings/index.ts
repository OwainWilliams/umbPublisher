import Umbracidian from "main";
import { App, PluginSettingTab, Setting } from "obsidian";
import { GetUmbracoSiteNodes } from "methods/getUmbracoSiteNodes";

export class SettingTab extends PluginSettingTab {
	plugin: Umbracidian;

	constructor(app: App, plugin: Umbracidian) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Umbracidian' });
		new Setting(containerEl)
			.setName('Website URL')
			.setDesc('The URL of the Umbraco website e.g. https://example.com')
			.addText(text => text
				.setPlaceholder('Enter the website URL')
				.setValue(this.plugin.settings.websiteUrl)
				.onChange(async (value) => {
					this.plugin.settings.websiteUrl = value;
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
				.setName('Client Secret')
				.setDesc('The client secret for the Umbraco API')
				.addText(text => text
					.setPlaceholder('Client Secret from Umbraco')
					.setValue(this.plugin.settings.clientSecret)
					.onChange(async (value) => {
						this.plugin.settings.clientSecret = value;
						await this.plugin.saveSettings();
					}).inputEl.setAttribute('type', 'password')),
			new Setting(containerEl)
				.setName('Blog Parent Node UUID')
				.setDesc('The UUID of the parent node for blog posts e.g. 00000000-0000-0000-0000-00000000000, leave empty for root')
				.addText(text => text
					.setPlaceholder('Enter the parent node UUID')
					.setValue(this.plugin.settings.blogParentNodeId)
					.onChange(async (value) => {
						this.plugin.settings.blogParentNodeId = value;
						await this.plugin.saveSettings();
					})),
			new Setting(containerEl)
				.setName('DocType alias')
				.setDesc('This is the alias of the DocType you want to use for your blog posts')
				.addText(text => text
					.setPlaceholder('Enter the DocType alias')
					.setValue(this.plugin.settings.blogDocTypeAlias)
					.onChange(async (value) => {
						this.plugin.settings.blogDocTypeAlias = value;
						await this.plugin.saveSettings();
					})),
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
				.setName('Blog Content Editor alias')
				.setDesc('This should be an Umbraco.MarkdownEditor property on your page')
				.addText(text => text
					.setPlaceholder('Enter the Property alias')
					.setValue(this.plugin.settings.blogContentAlias)
					.onChange(async (value) => {
						this.plugin.settings.blogContentAlias = value;
						await this.plugin.saveSettings();
					})),
					// Add a dropdown with a list of Nodes from GetUmbracoSiteNodes
			new Setting(containerEl)
				.setName('Select DocType')
				.setDesc('Select the DocType you want to use for your blog posts')
				.addDropdown(async (dropdown) => {
					const token = this.plugin.bearerToken;
					const websiteUrl = this.plugin.settings.websiteUrl;
					const docType = this.plugin.settings.blogDocTypeAlias;

					if (!token) {
						new Notice('Bearer token is null. Please check your settings.');
						return;
					}

					const siteRootJson = await GetUmbracoSiteNodes(docType, websiteUrl, token);
					if (siteRootJson) {
						siteRootJson.forEach((node: any) => {
							dropdown.addOption(node.id, node.name);
						});
					}
				})),
	}
}
