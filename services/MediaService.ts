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
    total?: number;
}

interface MediaDetailsResponse {
    values?: Array<{
        alias: string;
        value?: string | {
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
    private static readonly TREE_PAGE_SIZE = 100;
    private static readonly TREE_MAX_PAGES = 50;

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
        const value = umbracoFile?.value;
        const url = typeof value === 'string' ? value : (value?.src || value?.url);

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

    /**
     * The media tree endpoints are paged, so a single unpaged request only ever
     * sees the first page - walk them all so existing items are actually found.
     */
    private async fetchMediaTreeItems(endpoint: string): Promise<MediaItem[]> {
        const separator = endpoint.includes('?') ? '&' : '?';
        const items: MediaItem[] = [];

        for (let page = 0; page < MediaService.TREE_MAX_PAGES; page++) {
            const skip = page * MediaService.TREE_PAGE_SIZE;
            const response = await this.apiService.callApi(
                `${endpoint}${separator}skip=${skip}&take=${MediaService.TREE_PAGE_SIZE}`
            ) as MediaTreeResponse;

            const pageItems = response?.items;
            if (!pageItems || pageItems.length === 0) {
                break;
            }

            items.push(...pageItems);

            if (pageItems.length < MediaService.TREE_PAGE_SIZE || items.length >= (response.total ?? items.length)) {
                break;
            }
        }

        return items;
    }

    private matchesName(item: MediaItem, name: string): boolean {
        if (item.name === name) {
            return true;
        }

        return (item.variants || []).some(variant => variant.name === name);
    }

    private async findExistingObsidianFolder(): Promise<string | null> {
        try {
            const items = await this.fetchMediaTreeItems('/umbraco/management/api/v1/tree/media/root');
            const obsidianFolder = items.find(item => this.matchesName(item, MediaService.OBSIDIAN_FOLDER_NAME));

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

        const created = await this.apiService.callApi<{ id?: string }>(
            '/umbraco/management/api/v1/media',
            'POST',
            createPayload
        );

        const createdId = created?.id || folderId;

        await this.waitForFolderCreation();
        const verifiedId = await this.verifyFolderCreation(createdId);

        this.obsidianFolderId = verifiedId;
        return verifiedId;
    }

    private async waitForFolderCreation(): Promise<void> {
        await new Promise(resolve => window.setTimeout(resolve, MediaService.FOLDER_CREATION_DELAY));
    }

    private async verifyFolderCreation(createdId: string): Promise<string> {
        const items = await this.fetchMediaTreeItems('/umbraco/management/api/v1/tree/media/root');

        const verifiedFolder = items.find(item =>
            item.id === createdId || this.matchesName(item, MediaService.OBSIDIAN_FOLDER_NAME)
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
            '.svg': 'image/svg+xml',
            '.bmp': 'image/bmp',
            '.avif': 'image/avif',
            '.tif': 'image/tiff',
            '.tiff': 'image/tiff',
            '.ico': 'image/x-icon'
        };

        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    private async findMediaByName(fileName: string, parentFolderId: string): Promise<string | null> {
        try {
            const items = await this.fetchMediaTreeItems(
                `/umbraco/management/api/v1/tree/media/children?parentId=${parentFolderId}`
            );

            const existing = items.find(item => this.matchesName(item, fileName));

            return existing?.id || null;
        } catch {
            return null;
        }
    }
}