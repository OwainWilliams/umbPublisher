import { UmbracoApiService } from './UmbracoApiService';
import { MediaService } from './MediaService';
import { GenerateGuid } from '../methods/generateGuid';
import { Notice, TFile, App } from 'obsidian';
import { umbpublisherSettings, UmbracoDocType, UmbracoProperty } from '../types/index';

export interface CreateDocumentRequest {
    id: string;
    parent: { id: string } | null;
    documentType: { id: string };
    template: { id: string } | null;
    values: Array<{
        editorAlias?: string;
        alias: string;
        value: unknown;
        culture: string | null;
        segment: string | null;
        entityType?: string;
    }>;
    variants: Array<{
        culture: string | null;
        segment: string | null;
        state: string | null;
        name: string;
        publishDate: string | null;
        createDate: string | null;
        updateDate: string | null;
        scheduledPublishDate: string | null;
        scheduledUnpublishDate: string | null;
    }>;
}

interface ImageEmbed {
    /** The exact embed text as it appears in the note. */
    raw: string;
    /** The link target, with any size/subpath suffix removed and URL-decoded. */
    target: string;
    /** Alt text supplied by the author, if any. */
    alt: string;
}

export class DocumentService {
    private static readonly WIKI_EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;
    private static readonly MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    private static readonly IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tif', 'tiff', 'ico'];

    private mediaService: MediaService;

    constructor(private apiService: UmbracoApiService, private app: App) {
        this.mediaService = new MediaService(apiService);
    }

    /**
     * Finds every locally embedded image in the note, uploads it to the Umbraco
     * media library and swaps the embed for an <img> tag pointing at the media URL.
     *
     * Handles both Obsidian wiki embeds (`![[image.png]]`, including `|size` and
     * `#subpath` suffixes) and standard markdown images (`![alt](path/image.png)`,
     * including URL-encoded paths, <angle brackets> and link titles).
     */
    async processImagesInContent(
        content: string,
        sourcePath = ''
    ): Promise<{ content: string; uploadedImages: string[]; failedImages: string[] }> {
        const embeds = this.extractImageEmbeds(content);
        const uploadedImages: string[] = [];
        const failedImages: string[] = [];

        if (embeds.length === 0) {
            return { content, uploadedImages, failedImages };
        }

        new Notice(`Uploading ${embeds.length} image${embeds.length === 1 ? '' : 's'} to Umbraco...`);

        const replacements = new Map<string, string>();
        const urlCache = new Map<string, string>();

        for (const embed of embeds) {
            try {
                const imageFile = this.resolveImageFile(embed.target, sourcePath);

                if (!imageFile) {
                    failedImages.push(`${embed.target} (not found in vault)`);
                    continue;
                }

                let mediaUrl = urlCache.get(imageFile.path);

                if (!mediaUrl) {
                    const arrayBuffer = await this.app.vault.readBinary(imageFile);
                    const obsidianFolderId = await this.mediaService.getOrCreateObsidianFolder();
                    const mediaId = await this.mediaService.uploadImage(arrayBuffer, imageFile.name, obsidianFolderId);

                    mediaUrl = await this.mediaService.getMediaUrl(mediaId);
                    urlCache.set(imageFile.path, mediaUrl);
                    uploadedImages.push(mediaId);
                }

                const alt = embed.alt || imageFile.basename;
                replacements.set(embed.raw, `<img src="${mediaUrl}" alt="${this.escapeHtmlAttribute(alt)}" />`);

            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                failedImages.push(`${embed.target} (${reason})`);
            }
        }

        let processedContent = content;
        for (const [raw, replacement] of replacements) {
            processedContent = processedContent.split(raw).join(replacement);
        }

        if (failedImages.length > 0) {
            console.error('umbPublisher: some images could not be uploaded', failedImages);
            new Notice(`Could not upload ${failedImages.length} image${failedImages.length === 1 ? '' : 's'}:\n${failedImages.join('\n')}`);
        }

        return { content: processedContent, uploadedImages, failedImages };
    }

    /**
     * Collects the unique local image embeds in the content, keyed on the raw
     * embed text so the same image referenced twice is only uploaded once.
     */
    private extractImageEmbeds(content: string): ImageEmbed[] {
        const embeds = new Map<string, ImageEmbed>();

        for (const match of content.matchAll(DocumentService.WIKI_EMBED_REGEX)) {
            const embed = this.parseWikiEmbed(match[0], match[1]);
            if (embed && !embeds.has(embed.raw)) {
                embeds.set(embed.raw, embed);
            }
        }

        for (const match of content.matchAll(DocumentService.MARKDOWN_IMAGE_REGEX)) {
            const embed = this.parseMarkdownEmbed(match[0], match[1], match[2]);
            if (embed && !embeds.has(embed.raw)) {
                embeds.set(embed.raw, embed);
            }
        }

        return Array.from(embeds.values());
    }

    private parseWikiEmbed(raw: string, inner: string): ImageEmbed | null {
        const parts = inner.split('|');
        const target = this.normaliseTarget(parts[0].split('#')[0]);

        if (!this.isLocalImage(target)) {
            return null;
        }

        // Obsidian uses the pipe for either a display size (`|400`, `|400x300`)
        // or alt text - only the latter is worth keeping.
        const alias = parts.slice(1).join('|').trim();
        const alt = alias && !/^\d+(?:x\d+)?$/.test(alias) ? alias : '';

        return { raw, target, alt };
    }

    private parseMarkdownEmbed(raw: string, alt: string, destination: string): ImageEmbed | null {
        const target = this.normaliseTarget(this.stripLinkTitle(destination));

        if (!this.isLocalImage(target)) {
            return null;
        }

        return { raw, target, alt: alt.trim() };
    }

    private stripLinkTitle(destination: string): string {
        const trimmed = destination.trim();

        if (trimmed.startsWith('<')) {
            const end = trimmed.indexOf('>');
            if (end !== -1) {
                return trimmed.substring(1, end);
            }
        }

        const withTitle = trimmed.match(/^(.*?)\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/);
        return withTitle ? withTitle[1] : trimmed;
    }

    private normaliseTarget(target: string): string {
        const trimmed = target.trim().replace(/^\.\//, '');

        try {
            return decodeURIComponent(trimmed);
        } catch {
            // Leave paths containing a stray '%' untouched rather than failing.
            return trimmed;
        }
    }

    private isLocalImage(target: string): boolean {
        if (!target || !target.includes('.')) {
            return false;
        }

        // Skip anything already hosted elsewhere (http:, https:, data:, //cdn...).
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) {
            return false;
        }

        const extension = target.substring(target.lastIndexOf('.') + 1).toLowerCase();
        return DocumentService.IMAGE_EXTENSIONS.includes(extension);
    }

    private resolveImageFile(target: string, sourcePath: string): TFile | null {
        // Obsidian's own resolver handles shortest-path, relative and absolute links.
        const linked = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
        if (linked) {
            return linked;
        }

        const files = this.app.vault.getFiles();
        return files.find((f: TFile) =>
            f.path === target ||
            f.name === target ||
            f.path.endsWith('/' + target)
        ) || null;
    }

    private escapeHtmlAttribute(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async createDocument(
        docTypeId: string,
        title: string,
        content: string,
        parentId: string | null,
        titleAlias: string,
        contentAlias: string,
        sourceFile?: TFile,
        settings?: umbpublisherSettings
    ): Promise<unknown> {
        let processedContent = content;
        if (sourceFile) {
            // The note path lets Obsidian resolve relative and shortest-path links.
            const { content: processed } = await this.processImagesInContent(content, sourceFile.path);
            processedContent = processed;
        }

        const documentId = await GenerateGuid();

        // Branch based on content mode
        if (settings?.contentMode === 'blockList' || settings?.contentMode === 'blockGrid') {
            return this.createDocumentWithBlocks(
                documentId,
                docTypeId,
                title,
                processedContent,
                parentId,
                settings
            );
        } else {
            return this.createDocumentLegacy(
                documentId,
                docTypeId,
                title,
                processedContent,
                parentId,
                titleAlias,
                contentAlias
            );
        }
    }

    /**
     * Legacy method: Creates document with direct markdown property
     */
    private async createDocumentLegacy(
        documentId: string,
        docTypeId: string,
        title: string,
        content: string,
        parentId: string | null,
        titleAlias: string,
        contentAlias: string
    ): Promise<unknown> {
        // First, get the document type details to understand the property structure
        const docTypeDetails = await this.apiService.callApi<UmbracoDocType>(`/umbraco/management/api/v1/document-type/${docTypeId}`);
        
        if (!docTypeDetails) {
            throw new Error('Failed to fetch document type details');
        }
        
        // Build the values array with proper editor aliases
        const values: CreateDocumentRequest['values'] = [];
        
        // Collect all properties: direct + from compositions
        let properties: UmbracoProperty[] = docTypeDetails.properties || [];
        if (docTypeDetails.compositions) {
            for (const comp of docTypeDetails.compositions) {
                if (comp.properties) {
                    properties = properties.concat(comp.properties);
                }
                const compDocTypeId = comp.documentType?.id || comp.id;
                if (compDocTypeId) {
                    const compDetails = await this.apiService.callApi<UmbracoDocType>(`/umbraco/management/api/v1/document-type/${compDocTypeId}`);
                    if (compDetails?.properties) {
                        properties = properties.concat(compDetails.properties);
                    }
                }
            }
        }

        const titleProperty = properties.find((p) => p.alias === titleAlias);
        const contentProperty = properties.find((p) => p.alias === contentAlias);
        
        // If we can't find the properties, let's try a simpler approach
        if (!titleProperty || !contentProperty) {
            // Add title property with fallback
            values.push({
                editorAlias: 'Umbraco.TextBox',
                alias: titleAlias,
                value: title || "",
                culture: null,
                segment: null
            });
            
            // Add content property with fallback
            values.push({
                editorAlias: 'Umbraco.MarkdownEditor',
                alias: contentAlias,
                value: content || "",
                culture: null,
                segment: null
            });
        } else {
            // Add title property
            values.push({
                editorAlias: titleProperty.dataType?.editorAlias || 'Umbraco.TextBox',
                alias: titleAlias,
                value: title || "",
                culture: null,
                segment: null
            });
            
            // Add content property
            values.push({
                editorAlias: contentProperty.dataType?.editorAlias || 'Umbraco.MarkdownEditor',
                alias: contentAlias,
                value: content || "",
                culture: null,
                segment: null
            });
        }
        
        // Add default values for other properties if we found them
        if (properties.length > 0) {
            properties.forEach((prop) => {
                if (prop.alias !== titleAlias && prop.alias !== contentAlias) {
                    const editorAlias = prop.dataType?.editorAlias;
                    
                    // Add common default properties
                    if (prop.alias === 'isIndexable' || prop.alias === 'isFollowable') {
                        values.push({
                            editorAlias: 'Umbraco.TrueFalse',
                            alias: prop.alias,
                            value: true,
                            culture: null,
                            segment: null
                        });
                    } else if (prop.alias === 'hideFromTopNavigation' || prop.alias === 'umbracoNaviHide' || prop.alias === 'hideFromXMLSitemap') {
                        values.push({
                            editorAlias: 'Umbraco.TrueFalse',
                            alias: prop.alias,
                            value: false,
                            culture: null,
                            segment: null
                        });
                    } else if (prop.alias === 'articleDate' && editorAlias === 'Umbraco.DateTime') {
                        values.push({
                            editorAlias: 'Umbraco.DateTime',
                            entityType: 'document-property-value',
                            culture: null,
                            segment: null,
                            alias: prop.alias,
                            value: new Date().toISOString().replace('T', ' ').substring(0, 19)
                        });
                    }
                }
            });
        }

        const documentRequest: CreateDocumentRequest = {
            id: documentId,
            parent: parentId && parentId.trim() !== '' && parentId !== 'null' 
                ? { id: parentId } 
                : null,
            documentType: { id: docTypeId },
            template: null,
            values: values,
            variants: [
                {
                    culture: null,
                    segment: null,
                    state: null,
                    name: title || "Untitled",
                    publishDate: null,
                    createDate: null,
                    updateDate: null,
                    scheduledPublishDate: null,
                    scheduledUnpublishDate: null
                }
            ]
        };


        try {
            // Create document directly without validation
            const createResponse = await this.apiService.callApi(
                '/umbraco/management/api/v1/document',
                'POST',
                documentRequest
            );

            if (!createResponse) {
                throw new Error('Document creation failed - no response received');
            }

            return createResponse;

        } catch (error) {
            if (error.message && error.message.includes('400')) {
                throw new Error(`Invalid request data. Check:\n1. Document type ID '${docTypeId}' exists\n2. Property aliases '${titleAlias}' and '${contentAlias}' are correct\n3. Parent node ID '${parentId}' is valid\n\nOriginal error: ${error.message}`);
            }
            
            throw error;
        }
    }

    /**
     * Creates document with Block List or Block Grid structure
     */
    private async createDocumentWithBlocks(
        documentId: string,
        docTypeId: string,
        title: string,
        content: string,
        parentId: string | null,
        settings: umbpublisherSettings
    ): Promise<unknown> {
        const isBlockGrid = settings.contentMode === 'blockGrid';
        const modeLabel = isBlockGrid ? 'Block Grid' : 'Block List';

        // Generate GUIDs for block structure
        const elementUdi = await GenerateGuid();
        const elementTypeKey = settings.blockElementTypeId;

        // Build layout item based on mode
        const layoutKey = isBlockGrid ? 'Umbraco.BlockGrid' : 'Umbraco.BlockList';
        const layoutItem = isBlockGrid
            ? {
                contentUdi: `umb://element/${elementUdi}`,
                areas: [],
                columnSpan: 12,
                rowSpan: 1
            }
            : {
                contentUdi: `umb://element/${elementUdi}`
            };

        // Build block JSON structure
        const blockValue = {
            layout: {
                [layoutKey]: [layoutItem]
            },
            contentData: [
                {
                    contentTypeKey: elementTypeKey,
                    udi: `umb://element/${elementUdi}`,
                    [settings.blockContentPropertyAlias]: content
                }
            ],
            settingsData: []
        };

        // Fetch document type to get property details
        const docTypeDetails = await this.apiService.callApi<UmbracoDocType>(`/umbraco/management/api/v1/document-type/${docTypeId}`);

        if (!docTypeDetails) {
            throw new Error('Failed to fetch document type details');
        }

        // Collect all properties: direct + from compositions
        let properties: UmbracoProperty[] = docTypeDetails.properties || [];
        if (docTypeDetails.compositions) {
            for (const comp of docTypeDetails.compositions) {
                if (comp.properties) {
                    properties = properties.concat(comp.properties);
                }
                const compDocTypeId = comp.documentType?.id || comp.id;
                if (compDocTypeId) {
                    const compDetails = await this.apiService.callApi<UmbracoDocType>(`/umbraco/management/api/v1/document-type/${compDocTypeId}`);
                    if (compDetails?.properties) {
                        properties = properties.concat(compDetails.properties);
                    }
                }
            }
        }

        // Find the BlockList property
        const blockListProperty = properties.find((p) => p.alias === settings.blockPropertyAlias);

        if (!blockListProperty) {
            throw new Error(`BlockList property '${settings.blockPropertyAlias}' not found on document type.`);
        }

        // Build values array
        const editorAlias = isBlockGrid ? 'Umbraco.BlockGrid' : 'Umbraco.BlockList';
        const values: CreateDocumentRequest['values'] = [
            {
                editorAlias: editorAlias,
                alias: settings.blockPropertyAlias,
                value: blockValue,
                culture: null,
                segment: null
            }
        ];

        // Add other required properties (title, etc.)
        const titleProperty = properties.find((p) => p.alias === settings.titleAlias);
        if (titleProperty) {
            values.push({
                editorAlias: titleProperty.dataType?.editorAlias || 'Umbraco.TextBox',
                alias: settings.titleAlias,
                value: title || "",
                culture: null,
                segment: null
            });
        }

        // Add default boolean and date properties
        properties.forEach((prop) => {
            if (prop.alias !== settings.blockPropertyAlias && prop.alias !== settings.titleAlias) {
                const propEditorAlias = prop.dataType?.editorAlias;

                if (prop.alias === 'isIndexable' || prop.alias === 'isFollowable') {
                    values.push({
                        editorAlias: 'Umbraco.TrueFalse',
                        alias: prop.alias,
                        value: true,
                        culture: null,
                        segment: null
                    });
                } else if (prop.alias === 'hideFromTopNavigation' || prop.alias === 'umbracoNaviHide' || prop.alias === 'hideFromXMLSitemap') {
                    values.push({
                        editorAlias: 'Umbraco.TrueFalse',
                        alias: prop.alias,
                        value: false,
                        culture: null,
                        segment: null
                    });
                } else if (prop.alias === 'articleDate' && propEditorAlias === 'Umbraco.DateTime') {
                    values.push({
                        editorAlias: 'Umbraco.DateTime',
                        entityType: 'document-property-value',
                        culture: null,
                        segment: null,
                        alias: prop.alias,
                        value: new Date().toISOString().replace('T', ' ').substring(0, 19)
                    });
                }
            }
        });

        const documentRequest: CreateDocumentRequest = {
            id: documentId,
            parent: parentId && parentId.trim() !== '' && parentId !== 'null'
                ? { id: parentId }
                : null,
            documentType: { id: docTypeId },
            template: null,
            values: values,
            variants: [
                {
                    culture: null,
                    segment: null,
                    state: null,
                    name: title || "Untitled",
                    publishDate: null,
                    createDate: null,
                    updateDate: null,
                    scheduledPublishDate: null,
                    scheduledUnpublishDate: null
                }
            ]
        };


        try {
            const createResponse = await this.apiService.callApi(
                '/umbraco/management/api/v1/document',
                'POST',
                documentRequest
            );

            if (!createResponse) {
                throw new Error('Document creation failed - no response received');
            }

            return createResponse;

        } catch (error) {
            if (error.message && error.message.includes('400')) {
                throw new Error(`Invalid ${modeLabel} request. Check element type and property configuration.\n\nOriginal error: ${error.message}`);
            }

            throw error;
        }
    }
}