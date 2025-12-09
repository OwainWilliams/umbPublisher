import { UmbracoApiService } from './UmbracoApiService';
import { GenerateGuid } from '../methods/generateGuid';

interface MediaType {
    id: string;
    name: string;
}

interface MediaItem {
    id: string;
    name: string;
    variants?: Array<{ name: string; culture: string | null; segment: string | null }>;
}

interface MediaTreeResponse {
    items?: MediaItem[];
}

interface MediaDetailsResponse {
    values?: Array<{
        alias: string;
        value?: {
            src?: string;
            url?: string;
        };
    }>;
}

interface MediaTypeResponse {
    items: MediaType[];
}

export class MediaService {
    private static readonly FOLDER_TYPE_NAME = 'Folder';
    private static readonly IMAGE_TYPE_NAME = 'Image';
    private static readonly OBSIDIAN_FOLDER_NAME = 'Obsidian';
    private static readonly UMBRACO_FILE_ALIAS = 'umbracoFile';
    private static readonly FOLDER_CREATION_DELAY = 1000;

    private folderMediaTypeId: string | null = null;
    private imageMediaTypeId: string | null = null;
    private obsidianFolderId: string | null = null;

    constructor(private apiService: UmbracoApiService) {}

    async getOrCreateObsidianFolder(): Promise<string> {
        if (this.obsidianFolderId) {
            return this.obsidianFolderId;
        }

        const existingFolder = await this.findExistingObsidianFolder();
        if (existingFolder) {
            this.obsidianFolderId = existingFolder;
            return existingFolder;
        }

        return await this.createObsidianFolder();
    }

    async uploadImage(
        imageData: ArrayBuffer,
        fileName: string,
        parentFolderId: string
    ): Promise<string> {
        const existingMedia = await this.findMediaByName(fileName, parentFolderId);
        if (existingMedia) {
            return existingMedia;
        }

        const temporaryFileId = await this.uploadTemporaryFile(imageData, fileName);
        const imageTypeId = await this.getImageMediaTypeId();
        const mediaKey = await this.createMediaItem(fileName, parentFolderId, imageTypeId, temporaryFileId);

        return mediaKey;
    }

    async getMediaUrl(mediaId: string): Promise<string> {
        const media = await this.apiService.callApi(
            `/umbraco/management/api/v1/media/${mediaId}`
        ) as MediaDetailsResponse;

        const umbracoFile = media?.values?.find(v => v.alias === MediaService.UMBRACO_FILE_ALIAS);
        const url = umbracoFile?.value?.src || umbracoFile?.value?.url;

        if (!url) {
            throw new Error(`Media URL not found for ID: ${mediaId}`);
        }

        return url;
    }

    private async getFolderMediaTypeId(): Promise<string> {
        if (this.folderMediaTypeId) {
            return this.folderMediaTypeId;
        }

        const allowedTypes = await this.apiService.callApi(
            '/umbraco/management/api/v1/media-type/allowed-at-root'
        ) as MediaTypeResponse;

        const folderType = allowedTypes.items.find(item => item.name === MediaService.FOLDER_TYPE_NAME);

        if (!folderType) {
            throw new Error('Folder media type not found');
        }

        this.folderMediaTypeId = folderType.id;
        return folderType.id;
    }

    private async getImageMediaTypeId(): Promise<string> {
        if (this.imageMediaTypeId) {
            return this.imageMediaTypeId;
        }

        const imageTypeId = await this.getImageTypeFromAllowedChildren() 
            || await this.getImageTypeFromFullList();

        if (!imageTypeId) {
            throw new Error('Image media type not found');
        }

        this.imageMediaTypeId = imageTypeId;
        return imageTypeId;
    }

    private async getImageTypeFromAllowedChildren(): Promise<string | null> {
        try {
            const folderMediaTypeId = await this.getFolderMediaTypeId();
            const allowedInFolder = await this.apiService.callApi(
                `/umbraco/management/api/v1/media-type/${folderMediaTypeId}/allowed-children`
            ) as MediaTypeResponse;

            const imageType = allowedInFolder.items.find(item => item.name === MediaService.IMAGE_TYPE_NAME);
            return imageType?.id || null;
        } catch {
            return null;
        }
    }

    private async getImageTypeFromFullList(): Promise<string | null> {
        const mediaTypes = await this.apiService.callApi(
            '/umbraco/management/api/v1/media-type?skip=0&take=100'
        ) as MediaTypeResponse;

        const imageType = mediaTypes.items.find(item => item.name === MediaService.IMAGE_TYPE_NAME);
        return imageType?.id || null;
    }

    private async findExistingObsidianFolder(): Promise<string | null> {
        try {
            const response = await this.apiService.callApi(
                '/umbraco/management/api/v1/tree/media/root'
            ) as MediaTreeResponse;

            if (!response?.items) {
                return null;
            }

            const obsidianFolder = response.items.find(item =>
                item.name === MediaService.OBSIDIAN_FOLDER_NAME ||
                item.variants?.[0]?.name === MediaService.OBSIDIAN_FOLDER_NAME
            );

            return obsidianFolder?.id || null;
        } catch {
            return null;
        }
    }

    private async createObsidianFolder(): Promise<string> {
        const folderId = await GenerateGuid();
        const folderMediaTypeId = await this.getFolderMediaTypeId();

        const createPayload = {
            id: folderId,
            parent: null,
            mediaType: { id: folderMediaTypeId },
            values: [],
            variants: [{
                culture: null,
                segment: null,
                name: MediaService.OBSIDIAN_FOLDER_NAME
            }]
        };

        const created = await this.apiService.callApi(
            '/umbraco/management/api/v1/media',
            'POST',
            createPayload
        );

        const createdId = (created as any)?.id || folderId;

        await this.waitForFolderCreation();
        const verifiedId = await this.verifyFolderCreation(createdId);

        this.obsidianFolderId = verifiedId;
        return verifiedId;
    }

    private async waitForFolderCreation(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, MediaService.FOLDER_CREATION_DELAY));
    }

    private async verifyFolderCreation(createdId: string): Promise<string> {
        const verifyResponse = await this.apiService.callApi(
            '/umbraco/management/api/v1/tree/media/root'
        ) as MediaTreeResponse;

        const verifiedFolder = verifyResponse?.items?.find(item =>
            item.id === createdId || item.name === MediaService.OBSIDIAN_FOLDER_NAME
        );

        return verifiedFolder?.id || createdId;
    }

    private async createMediaItem(
        fileName: string,
        parentFolderId: string,
        imageTypeId: string,
        temporaryFileId: string
    ): Promise<string> {
        const mediaKey = await GenerateGuid();

        const createMediaPayload = {
            id: mediaKey,
            parent: { id: parentFolderId },
            mediaType: { id: imageTypeId },
            values: [{
                alias: MediaService.UMBRACO_FILE_ALIAS,
                value: { temporaryFileId }
            }],
            variants: [{
                culture: null,
                segment: null,
                name: fileName
            }]
        };

        await this.apiService.callApi(
            '/umbraco/management/api/v1/media',
            'POST',
            createMediaPayload
        );

        return mediaKey;
    }

    private async uploadTemporaryFile(imageData: ArrayBuffer, fileName: string): Promise<string> {
        const extension = fileName.substring(fileName.lastIndexOf('.'));
        const mimeType = this.getMimeType(extension);
        const tempFileId = await GenerateGuid();

        const endpoint = `/umbraco/management/api/v1/temporary-file?id=${tempFileId}`;

        await this.apiService.uploadFile(
            endpoint,
            imageData,
            fileName,
            mimeType,
            tempFileId
        );

        return tempFileId;
    }

    private getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
        };

        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    private async findMediaByName(fileName: string, parentFolderId: string): Promise<string | null> {
        try {
            const response = await this.apiService.callApi(
                `/umbraco/management/api/v1/tree/media/children?parentId=${parentFolderId}`
            ) as MediaTreeResponse;

            if (!response?.items) {
                return null;
            }

            const existing = response.items.find(item =>
                item.name === fileName || item.variants?.[0]?.name === fileName
            );

            return existing?.id || null;
        } catch {
            return null;
        }
    }
}