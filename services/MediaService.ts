import { UmbracoApiService } from './UmbracoApiService';
import { GenerateGuid } from '../methods/generateGuid';
import { requestUrl } from 'obsidian';

export class MediaService {
    private folderMediaTypeId: string | null = null;
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
            console.log('MediaService: Image size:', imageData.byteLength, 'bytes');
            console.log('MediaService: Parent folder ID:', parentFolderId);
            
            // Step 1: Upload to temporary file storage
            console.log('MediaService: Uploading to temporary file storage...');
            const tempFileId = await this.uploadTemporaryFile(imageData, fileName);
            console.log('MediaService: Temporary file uploaded with ID:', tempFileId);
            
            // Step 2: Create media item referencing the temporary file
            const mediaId = await GenerateGuid();
            console.log('MediaService: Generated media ID:', mediaId);
            
            const createPayload = {
                id: mediaId,
                parent: { id: parentFolderId },
                mediaType: {
                    id: 'cc07b313-0843-4aa8-bbda-871c8da728c8' // Image media type
                },
                values: [
                    {
                        alias: 'umbracoFile',
                        value: {
                            id: tempFileId
                        },
                        culture: null,
                        segment: null
                    }
                ],
                variants: [
                    {
                        culture: null,
                        segment: null,
                        name: fileName.substring(0, fileName.lastIndexOf('.'))
                    }
                ]
            };

            console.log('MediaService: Creating media with payload:', JSON.stringify(createPayload, null, 2));

            const created = await this.apiService.callApi(
                '/umbraco/management/api/v1/media',
                'POST',
                createPayload
            );

            console.log('MediaService: Media creation response:', JSON.stringify(created, null, 2));
            
            const createdId = (created as any)?.id || mediaId;
            console.log('MediaService: Media created with ID:', createdId);

            // Step 3: Get the media URL
            const media = await this.apiService.callApi(
                `/umbraco/management/api/v1/media/${createdId}`
            ) as any;

            console.log('MediaService: Retrieved media details:', JSON.stringify(media, null, 2));

            // Extract URL from umbracoFile property
            const umbracoFile = media.values?.find((v: any) => v.alias === 'umbracoFile');
            if (umbracoFile && umbracoFile.value) {
                // The URL could be in different locations
                const url = umbracoFile.value.src || umbracoFile.value.url || umbracoFile.value;
                console.log('MediaService: Image uploaded successfully, URL:', url);
                return url;
            }

            throw new Error('Could not retrieve media URL from response');
        } catch (error) {
            console.error('MediaService: Error uploading image:', error);
            throw error;
        }
    }

    private async uploadTemporaryFile(imageData: ArrayBuffer, fileName: string): Promise<string> {
        try {
            console.log('MediaService: Uploading temporary file:', fileName);
            console.log('MediaService: Image data size:', imageData.byteLength);
            
            // Generate a unique key for this upload
            const uniqueKey = await GenerateGuid();
            console.log('MediaService: Generated unique key:', uniqueKey);
            
            const extension = fileName.substring(fileName.lastIndexOf('.'));
            const mimeType = this.getMimeType(extension);
            console.log('MediaService: MIME type:', mimeType);
            
            // Single step: Upload with both id and file in multipart form-data
            console.log('MediaService: Uploading temporary file with ID and file...');
            const result = await this.apiService.uploadFile(
                '/umbraco/management/api/v1/temporary-file',
                imageData,
                fileName,
                mimeType,
                uniqueKey  // Pass the ID
            );

            console.log('MediaService: Upload result:', JSON.stringify(result, null, 2));
            console.log('MediaService: Temporary file uploaded successfully with ID:', uniqueKey);
            
            // Return the key we generated
            return uniqueKey;
        } catch (error) {
            console.error('MediaService: Error uploading temporary file:', error);
            throw error;
        }
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

    async uploadFile(endpoint: string, fileData: ArrayBuffer, fileName: string, mimeType: string): Promise<any> {
        console.log('=== Upload File Debug ===');
        console.log('this.baseUrl:', (this.apiService as any).baseUrl);
        console.log('typeof this.baseUrl:', typeof (this.apiService as any).baseUrl);
        console.log('endpoint:', endpoint);
        
        const url = `${(this.apiService as any).baseUrl}${endpoint}`;
        console.log('Constructed URL:', url);
        console.log('typeof url:', typeof url);
        
        // Validate URL format
        try {
            new URL(url);
            console.log('URL is valid');
        } catch (urlError) {
            console.error('URL validation failed:', urlError);
            console.error('URL parts - baseUrl:', (this.apiService as any).baseUrl, 'endpoint:', endpoint);
            throw new Error(`Invalid URL constructed: ${url}`);
        }
        
        console.log(`File name: ${fileName}`);
        console.log(`MIME type: ${mimeType}`);
        
        try {
            // Convert ArrayBuffer to Blob
            const blob = new Blob([fileData], { type: mimeType });
            
            // Create FormData
            const formData = new FormData();
            formData.append('file', blob, fileName);

            console.log('Making fetch request to:', url);

            // Use native fetch API
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Api-Key': (this.apiService as any).apiKey
                },
                body: formData
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                const errorMessage = `HTTP ${response.status}: ${errorText}`;
                console.error('API call failed:', {
                    endpoint,
                    method: 'POST',
                    status: response.status,
                    error: errorMessage
                });
                throw new Error(errorMessage);
            }

            const result = await response.json();
            console.log('File upload successful:', result);
            return result;
        } catch (error) {
            console.error('API call failed:', {
                endpoint,
                method: 'POST',
                status: 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}