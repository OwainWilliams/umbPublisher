import { UmbracoApiService } from './UmbracoApiService';
import { MediaService } from './MediaService';
import { GenerateGuid } from '../methods/generateGuid';
import { Notice, TFile, App } from 'obsidian';
import { umbpublisherSettings } from '../types/index';

export interface CreateDocumentRequest {
    id: string;
    parent: { id: string } | null;
    documentType: { id: string };
    template: { id: string } | null;
    values: Array<{
        editorAlias?: string;
        alias: string;
        value: any;
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

export class DocumentService {
    private mediaService: MediaService;

    constructor(private apiService: UmbracoApiService, private app: App) {
        this.mediaService = new MediaService(apiService);
    }

    async processImagesInContent(content: string, vault: any): Promise<{ content: string; uploadedImages: string[] }> {
        const imageRegex = /!\[\[([^\]]+)\]\]/g;
        const uploadedImages: string[] = [];
        let processedContent = content;

        const matches = Array.from(processedContent.matchAll(imageRegex));
        
        for (const match of matches) {
            const imageName = match[1];

            try {
                // Get all files in the vault to find the image
                const files = vault.getFiles();
                const imageFile = files.find((f: any) => 
                    f.name === imageName || 
                    f.path === imageName ||
                    f.path.endsWith('/' + imageName)
                );
                
                if (!imageFile) {
                    continue;
                }

                const arrayBuffer = await vault.adapter.readBinary(imageFile.path);
                const fileName = imageFile.name;
                
                const obsidianFolderId = await this.mediaService.getOrCreateObsidianFolder();
                const mediaId = await this.mediaService.uploadImage(arrayBuffer, fileName, obsidianFolderId);
                
                // Get the media URL
                const mediaUrl = await this.mediaService.getMediaUrl(mediaId);
                
                uploadedImages.push(mediaId);
                
                // Replace markdown image with HTML img tag using the media URL
                const replacement = `<img src="${mediaUrl}" alt="${imageName}" />`;
                processedContent = processedContent.replace(match[0], replacement);

            } catch (error) {
            }
        }

        return { content: processedContent, uploadedImages };
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
    ): Promise<any> {
        // Process images if source file is provided
        let processedContent = content;
        if (sourceFile) {
            // Pass the app.vault instead of sourceFile
            const { content: processed } = await this.processImagesInContent(content, this.app.vault);
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
    ): Promise<any> {
        // First, get the document type details to understand the property structure
        const docTypeDetails = await this.apiService.callApi(`/umbraco/management/api/v1/document-type/${docTypeId}`);
        
        if (!docTypeDetails) {
            throw new Error('Failed to fetch document type details');
        }
        
        // Build the values array with proper editor aliases
        const values: any[] = [];
        
        // Collect all properties: direct + from compositions
        let properties: any[] = (docTypeDetails as any).properties || [];
        if ((docTypeDetails as any).compositions) {
            for (const comp of (docTypeDetails as any).compositions) {
                if (comp.properties) {
                    properties = properties.concat(comp.properties);
                }
                const compDocTypeId = comp.documentType?.id || comp.id;
                if (compDocTypeId) {
                    const compDetails = await this.apiService.callApi(`/umbraco/management/api/v1/document-type/${compDocTypeId}`);
                    if (compDetails && (compDetails as any).properties) {
                        properties = properties.concat((compDetails as any).properties);
                    }
                }
            }
        }

        const titleProperty = properties.find((p: any) => p.alias === titleAlias);
        const contentProperty = properties.find((p: any) => p.alias === contentAlias);
        
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
            properties.forEach((prop: any) => {
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
    ): Promise<any> {
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
        const docTypeDetails = await this.apiService.callApi(`/umbraco/management/api/v1/document-type/${docTypeId}`);

        if (!docTypeDetails) {
            throw new Error('Failed to fetch document type details');
        }

        // Collect all properties: direct + from compositions
        let properties: any[] = (docTypeDetails as any).properties || [];
        if ((docTypeDetails as any).compositions) {
            for (const comp of (docTypeDetails as any).compositions) {
                if (comp.properties) {
                    properties = properties.concat(comp.properties);
                }
                const compDocTypeId = comp.documentType?.id || comp.id;
                if (compDocTypeId) {
                    const compDetails = await this.apiService.callApi(`/umbraco/management/api/v1/document-type/${compDocTypeId}`);
                    if (compDetails && (compDetails as any).properties) {
                        properties = properties.concat((compDetails as any).properties);
                    }
                }
            }
        }

        // Find the BlockList property
        const blockListProperty = properties.find((p: any) => p.alias === settings.blockPropertyAlias);

        if (!blockListProperty) {
            throw new Error(`BlockList property '${settings.blockPropertyAlias}' not found on document type.`);
        }

        // Build values array
        const editorAlias = isBlockGrid ? 'Umbraco.BlockGrid' : 'Umbraco.BlockList';
        const values: any[] = [
            {
                editorAlias: editorAlias,
                alias: settings.blockPropertyAlias,
                value: blockValue,
                culture: null,
                segment: null
            }
        ];

        // Add other required properties (title, etc.)
        const titleProperty = properties.find((p: any) => p.alias === settings.titleAlias);
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
        properties.forEach((prop: any) => {
            if (prop.alias !== settings.blockPropertyAlias && prop.alias !== settings.titleAlias) {
                const editorAlias = prop.dataType?.editorAlias;

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