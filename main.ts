/* eslint-disable @typescript-eslint/no-var-requires */

import { Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, umbpublisherSettings } from "./types/index";
import { SettingTab } from "./settings";
import { umbpublisherIcons } from "./icons/icons";
import { UmbracoApiService } from './services/UmbracoApiService';
import { DocumentService } from './services/DocumentService';
import { ContentParser } from './services/ContentParser';
import { ErrorHandler } from './services/ErrorHandler';
import { SettingsValidator } from './services/SettingsValidator';
import { GetUmbracoDocTypeById } from "./methods/getUmbracoDocType";

export default class umbpublisher extends Plugin {
    settings: umbpublisherSettings;
    private icons = new umbpublisherIcons();
    private apiService: UmbracoApiService | null = null;
    private documentService: DocumentService | null = null;
    private contentParser: ContentParser | null = null;

    async onload() {
        await this.loadSettings();
        this.initializeServices();
        this.setupUI();
        this.addSettingTab(new SettingTab(this.app, this));
    }

    private setupUI(): void {
        this.icons.registerIcons();
        
        this.addRibbonIcon('umbpublisher-logo', 'umbpublisher', this.handleRibbonClick.bind(this));
        
        this.addCommand({
            id: 'push-to-umbraco',
            name: 'Push to Umbraco',
            editorCheckCallback: this.handleEditorCommand.bind(this)
        });
    }

    private initializeServices(): void {
        if (SettingsValidator.validateBasicSettings(this.settings)) {
            this.apiService = new UmbracoApiService(
                this.settings.websiteUrl,
                this.settings.clientId,
                this.settings.clientSecret
            );
            this.documentService = new DocumentService(this.apiService);
        }
        this.contentParser = new ContentParser(this.app);
    }

    private async handleRibbonClick(): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            new Notice('No active Markdown view found.');
            return;
        }
        await this.publishToUmbraco(view);
    }

    private handleEditorCommand(checking: boolean, editor: Editor, view: MarkdownView): boolean {
        if (checking) return true;
        
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('No active Markdown view found.');
            return false;
        }
        
        this.publishToUmbraco(view).catch(error => 
            ErrorHandler.handle(error, 'Publishing to Umbraco')
        );
        return true;
    }

    private async publishToUmbraco(view: MarkdownView): Promise<void> {
        if (!SettingsValidator.validatePublishSettings(this.settings)) {
            return;
        }

        if (!this.documentService || !this.contentParser || !this.apiService) {
            new Notice('Services not initialized. Please check your settings.');
            return;
        }

        try {
            // Get bearer token
            const token = await this.apiService.getBearerToken();
            if (!token) {
                new Notice('Failed to get authentication token.');
                return;
            }

            // Get document type
            const docType = await GetUmbracoDocTypeById(
                this.settings.blogDocTypeId,
                this.settings.websiteUrl,
                token
            );

            if (!docType) {
                new Notice('Failed to get document type. Please check your settings.');
                return;
            }

            console.log('Document type fetched:', docType);

            // Parse content
            const content = await this.contentParser.parseContent(view);
            const title = this.contentParser.getActiveFileTitle();

            if (!content || !title) {
                new Notice('Failed to parse content or title.');
                return;
            }

            console.log('Parsed content:', { title, contentLength: content.content.length });

            // Create document
            await this.documentService.createDocument(
                docType.id,
                title,
                content.content,
                this.settings.blogParentNodeId,
                this.settings.titleAlias,
                this.settings.blogContentAlias
            );

            new Notice('Document created successfully!');
        } catch (error) {
            ErrorHandler.handle(error, 'Publishing to Umbraco');
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.initializeServices();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.initializeServices();
    }

    onunload() {
        if (this.apiService) {
            this.apiService.clearToken();
        }
    }
}
