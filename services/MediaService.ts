import { UmbracoApiService } from './UmbracoApiService';
import { GenerateGuid } from '../methods/generateGuid';

export class MediaService {
    private folderMediaTypeId: string | null = null;
    private imageMediaTypeId: string | null = null;
    private obsidianFolderId: string | null = null;

    constructor(private apiService: UmbracoApiService) {}

    async getFolderMediaTypeId(): Promise<string> {
        if (this.folderMediaTypeId) {
            return this.folderMediaTypeId;
        }

        console.log('MediaService: Getting folder media type ID...');
        
        const allowedTypes = await this.apiService.callApi(
            '/umbraco/management/api/v1/media-type/allowed-at-root'
        ) as { items: Array<{ id: string; name: string }> };

        console.log('MediaService: Allowed media types at root:', allowedTypes);

        const folderType = allowedTypes.items.find(item => item.name === 'Folder');
        
        if (!folderType) {
            throw new Error('Folder media type not found');
        }

        console.log('MediaService: Found folder media type ID:', folderType.id);
        this.folderMediaTypeId = folderType.id;
        return folderType.id;
    }

    async getImageMediaTypeId(): Promise<string> {
        if (this.imageMediaTypeId) {
            return this.imageMediaTypeId;
        }

        console.log('MediaService: Getting Image media type ID...');
        
        // Try to get from allowed types in a folder first
        try {
            const folderMediaTypeId = await this.getFolderMediaTypeId();
            const allowedInFolder = await this.apiService.callApi(
                `/umbraco/management/api/v1/media-type/${folderMediaTypeId}/allowed-children`
            ) as { items: Array<{ id: string; name: string }> };
            
            const imageType = allowedInFolder.items.find(item => item.name === 'Image');
            if (imageType) {
                console.log('MediaService: Image media type ID:', imageType.id);
                this.imageMediaTypeId = imageType.id;
                return imageType.id;
            }
        } catch (error) {
            console.log('MediaService: Could not get from allowed children, trying full list...');
        }
        
        // Fallback: get all media types with pagination
        const mediaTypes = await this.apiService.callApi(
            '/umbraco/management/api/v1/media-type?skip=0&take=100'
        ) as { items: Array<{ id: string; name: string }> };
        
        const imageType = mediaTypes.items.find(item => item.name === 'Image');
        if (!imageType) {
            throw new Error('Image media type not found');
        }
        
        console.log('MediaService: Image media type ID:', imageType.id);
        this.imageMediaTypeId = imageType.id;
        return imageType.id;
    }

    async getOrCreateObsidianFolder(): Promise<string> {
        // Return cached folder ID if available
        if (this.obsidianFolderId) {
            console.log('MediaService: Using cached Obsidian folder ID:', this.obsidianFolderId);
            return this.obsidianFolderId;
        }

        try {
            console.log('MediaService: Getting or creating Obsidian folder...');
            
            // Try to get the tree structure from root
            const response = await this.apiService.callApi(
                '/umbraco/management/api/v1/tree/media/root'
            ) as { items?: any[] };

            console.log('MediaService: Media tree response:', JSON.stringify(response, null, 2));

            if (response && response.items) {
                // Look for existing Obsidian folder
                const obsidianFolder = response.items.find((item: any) => 
                    item.name === 'Obsidian' || item.variants?.[0]?.name === 'Obsidian'
                );

                if (obsidianFolder) {
                    console.log('MediaService: Found existing Obsidian folder with ID:', obsidianFolder.id);
                    this.obsidianFolderId = obsidianFolder.id;
                    return obsidianFolder.id;
                }
            }

            // Create folder if not found
            console.log('MediaService: Creating new Obsidian folder...');
            const folderId = await GenerateGuid();
            const folderMediaTypeId = await this.getFolderMediaTypeId();
            
            console.log('MediaService: Generated folder ID:', folderId);
            
            const createPayload = {
                id: folderId,
                parent: null,
                mediaType: {
                    id: folderMediaTypeId
                },
                values: [],
                variants: [
                    {
                        culture: null,
                        segment: null,
                        name: 'Obsidian'
                    }
                ]
            };

            console.log('MediaService: Creating folder...');

            const created = await this.apiService.callApi(
                '/umbraco/management/api/v1/media',
                'POST',
                createPayload
            );

            console.log('MediaService: Folder creation response:', JSON.stringify(created, null, 2));
            
            const createdId = (created as any)?.id || folderId;
            console.log('MediaService: Using folder ID:', createdId);
            
            // Wait for folder to be committed
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify folder was created
            const verifyResponse = await this.apiService.callApi(
                '/umbraco/management/api/v1/tree/media/root'
            ) as { items?: any[] };
            
            const verifiedFolder = verifyResponse?.items?.find((item: any) => 
                item.id === createdId || item.name === 'Obsidian'
            );
            
            if (verifiedFolder) {
                console.log('MediaService: Verified folder with ID:', verifiedFolder.id);
                this.obsidianFolderId = verifiedFolder.id;
                return verifiedFolder.id;
            }
            
            this.obsidianFolderId = createdId;
            return createdId;
        } catch (error) {
            console.error('MediaService: Error getting/creating Obsidian folder:', error);
            throw error;
        }
    }

    async uploadImage(
        imageData: ArrayBuffer,
        fileName: string,
        parentFolderId: string
    ): Promise<string> {
        try {
            console.log('MediaService: Starting image upload for:', fileName);
            
            // Check if image already exists in the folder
            const existingMedia = await this.findMediaByName(fileName, parentFolderId);
            if (existingMedia) {
                console.log('MediaService: Image already exists with ID:', existingMedia);
                return existingMedia;
            }
            
            // Step 1: Upload to temporary file storage
            const temporaryFileId = await this.uploadTemporaryFile(imageData, fileName);
            console.log('MediaService: Temporary file ID:', temporaryFileId);
            
            // Step 2: Get the Image media type ID (cached)
            const imageTypeId = await this.getImageMediaTypeId();
            
            // Step 3: Create permanent media item from temporary file
            console.log('MediaService: Creating permanent media item...');
            const mediaKey = await GenerateGuid();
            
            const createMediaPayload = {
                id: mediaKey,
                parent: { id: parentFolderId },
                mediaType: { id: imageTypeId },
                values: [
                    {
                        alias: 'umbracoFile',
                        value: {
                            temporaryFileId: temporaryFileId
                        }
                    }
                ],
                variants: [
                    {
                        culture: null,
                        segment: null,
                        name: fileName
                    }
                ]
            };
            
            console.log('MediaService: Create media payload:', JSON.stringify(createMediaPayload, null, 2));
            
            await this.apiService.callApi(
                '/umbraco/management/api/v1/media',
                'POST',
                createMediaPayload
            );
            
            console.log('MediaService: Media item created with ID:', mediaKey);
            console.log('MediaService: Image uploaded successfully');
            
            return mediaKey;
        } catch (error) {
            console.error('MediaService: Error uploading image:', error);
            throw error;
        }
    }

    async getMediaUrl(mediaId: string): Promise<string> {
        try {
            console.log('MediaService: Getting media URL for ID:', mediaId);
            
            const media = await this.apiService.callApi(
                `/umbraco/management/api/v1/media/${mediaId}`
            ) as any;
            
            console.log('MediaService: Media details:', JSON.stringify(media, null, 2));
            
            // Extract URL from umbracoFile property
            const umbracoFile = media?.values?.find((v: any) => v.alias === 'umbracoFile');
            const url = umbracoFile?.value?.src || umbracoFile?.value?.url;
            
            if (!url) {
                throw new Error('Could not find media URL in response');
            }
            
            console.log('MediaService: Media URL:', url);
            return url;
        } catch (error) {
            console.error('MediaService: Error getting media URL:', error);
            throw error;
        }
    }

    private async uploadTemporaryFile(imageData: ArrayBuffer, fileName: string): Promise<string> {
        try {
            console.log('MediaService: Uploading temporary file:', fileName);
            console.log('MediaService: Image data size:', imageData.byteLength);
            
            const extension = fileName.substring(fileName.lastIndexOf('.'));
            const mimeType = this.getMimeType(extension);
            console.log('MediaService: MIME type:', mimeType);
            
            // Generate a unique ID for this temporary file
            const tempFileId = await GenerateGuid();
            console.log('MediaService: Generated temp file ID:', tempFileId);
            
            // Use the existing uploadFile method from apiService
            const endpoint = `/umbraco/management/api/v1/temporary-file?id=${tempFileId}`;
            
            const result = await this.apiService.uploadFile(
                endpoint,
                imageData,
                fileName,
                mimeType,
                tempFileId
            );

            console.log('MediaService: Upload result:', JSON.stringify(result, null, 2));
            
            // Return the temp file ID we generated
            console.log('MediaService: Temporary file uploaded successfully with ID:', tempFileId);
            return tempFileId;
        } catch (error) {
            console.error('MediaService: Error uploading temporary file:', error);
            throw error;
        }
    }

    private async uploadFileMultipart(
        endpoint: string,
        fileData: ArrayBuffer,
        fileName: string,
        mimeType: string
    ): Promise<any> {
        // This method is no longer used - keeping for backwards compatibility
        throw new Error('uploadFileMultipart is deprecated - use uploadTemporaryFile directly');
    }

    private getMimeType(extension: string): string {
        switch (extension.toLowerCase()) {
            case '.jpg':
            case '.jpeg':
                return 'image/jpeg';
            case '.png':
                return 'image/png';
            case '.gif':
                return 'image/gif';
            case '.webp':
                return 'image/webp';
            case '.svg':
                return 'image/svg+xml';
            default:
                return 'application/octet-stream';
        }
    }

    private async findMediaByName(fileName: string, parentFolderId: string): Promise<string | null> {
        try {
            console.log('MediaService: Searching for existing media:', fileName);
            
            const response = await this.apiService.callApi(
                `/umbraco/management/api/v1/tree/media/children?parentId=${parentFolderId}`
            ) as { items?: any[] };
            
            if (response && response.items) {
                const existing = response.items.find((item: any) => 
                    item.name === fileName || item.variants?.[0]?.name === fileName
                );
                
                if (existing) {
                    console.log('MediaService: Found existing media with ID:', existing.id);
                    return existing.id;
                }
            }
            
            return null;
        } catch (error) {
            console.error('MediaService: Error finding media by name:', error);
            return null;
        }
    }
}