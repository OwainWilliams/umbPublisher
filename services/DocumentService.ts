import { UmbracoApiService } from './UmbracoApiService';
import { MediaService } from './MediaService';
import { GenerateGuid } from '../methods/generateGuid';
import { Notice, TFile, App } from 'obsidian';

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

        const matches = Array.from(content.matchAll(imageRegex));
        
        console.log('DocumentService: Found', matches.length, 'images to process');
        
        for (const match of matches) {
            const imageName = match[1];
            console.log('DocumentService: Processing image:', imageName);

            try {
                // Get all files in the vault to find the image
                const files = vault.getFiles();
                const imageFile = files.find((f: any) => 
                    f.name === imageName || 
                    f.path === imageName ||
                    f.path.endsWith('/' + imageName)
                );
                
                if (!imageFile) {
                    console.warn('DocumentService: Image file not found:', imageName);
                    continue;
                }

                console.log('DocumentService: Found image file:', imageFile.path);

                const arrayBuffer = await vault.adapter.readBinary(imageFile.path);
                const fileName = imageFile.name;
                
                console.log('DocumentService: Read image data, size:', arrayBuffer.byteLength);
                
                const obsidianFolderId = await this.mediaService.getOrCreateObsidianFolder();
                const mediaId = await this.mediaService.uploadImage(arrayBuffer, fileName, obsidianFolderId);
                
                console.log('DocumentService: Uploaded image, media ID:', mediaId);
                
                // Get the media URL
                const mediaUrl = await this.mediaService.getMediaUrl(mediaId);
                
                console.log('DocumentService: Got media URL:', mediaUrl);
                
                uploadedImages.push(mediaId);
                
                // Replace markdown image with HTML img tag using the media URL
                const replacement = `<img src="${mediaUrl}" alt="${imageName}" />`;
                processedContent = processedContent.replace(match[0], replacement);
                
                console.log('DocumentService: Replaced', match[0], 'with', replacement);
                
            } catch (error) {
                console.error('DocumentService: Error processing image', imageName, error);
            }
        }

        console.log('DocumentService: Processed content:', processedContent.substring(0, 200));
        return { content: processedContent, uploadedImages };
    }

    async createDocument(
        docTypeId: string,
        title: string,
        content: string,
        parentId: string | null,
        titleAlias: string,
        contentAlias: string,
        sourceFile?: TFile
    ): Promise<any> {
        // Process images if source file is provided
        let processedContent = content;
        if (sourceFile) {
            console.log('Processing images in content...');
            // Pass the app.vault instead of sourceFile
            const { content: processed } = await this.processImagesInContent(content, this.app.vault);
            processedContent = processed;
            console.log('Images processed. Content length:', processedContent.length);
        }

        const documentId = await GenerateGuid();
        
        // First, get the document type details to understand the property structure
        console.log('Fetching document type details...');
        const docTypeDetails = await this.apiService.callApi(`/umbraco/management/api/v1/document-type/${docTypeId}`);
        
        if (!docTypeDetails) {
            throw new Error('Failed to fetch document type details');
        }
        
        console.log('Document type details:', JSON.stringify(docTypeDetails, null, 2));
        
        // Build the values array with proper editor aliases
        const values: any[] = [];
        
        // Try different ways to access properties
        let properties: any[] = [];
        
        if ((docTypeDetails as any).properties) {
            properties = (docTypeDetails as any).properties;
        } else if ((docTypeDetails as any).compositions) {
            // Sometimes properties are in compositions
            (docTypeDetails as any).compositions.forEach((comp: any) => {
                if (comp.properties) {
                    properties = properties.concat(comp.properties);
                }
            });
        }
        
        console.log('Available properties:', properties.map((p: any) => ({ alias: p.alias, editorAlias: p.dataType?.editorAlias })));
        console.log('Looking for title alias:', titleAlias);
        console.log('Looking for content alias:', contentAlias);
        
        const titleProperty = properties.find((p: any) => p.alias === titleAlias);
        const contentProperty = properties.find((p: any) => p.alias === contentAlias);
        
        console.log('Title property found:', titleProperty);
        console.log('Content property found:', contentProperty);
        
        // If we can't find the properties, let's try a simpler approach
        if (!titleProperty || !contentProperty) {
            console.log('Properties not found in document type, using fallback approach...');
            
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
                value: processedContent || "",
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
                value: processedContent || "",
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

        console.log('Final document request payload:', JSON.stringify(documentRequest, null, 2));

        try {
            // Create document directly without validation
            console.log('Creating document...');
            const createResponse = await this.apiService.callApi(
                '/umbraco/management/api/v1/document',
                'POST',
                documentRequest
            );

            if (!createResponse) {
                throw new Error('Document creation failed - no response received');
            }

            console.log('Document creation successful:', createResponse);
            return createResponse;

        } catch (error) {
            console.error('Error in document creation:', error);
            
            if (error.message && error.message.includes('400')) {
                throw new Error(`Invalid request data. Check:\n1. Document type ID '${docTypeId}' exists\n2. Property aliases '${titleAlias}' and '${contentAlias}' are correct\n3. Parent node ID '${parentId}' is valid\n\nOriginal error: ${error.message}`);
            }
            
            throw error;
        }
    }
}