import { Notice } from 'obsidian';
import { CallUmbracoApi } from './callUmbracoApi';

export async function GetUmbracoDocType(docType: string, websiteUrl: string, token: any): Promise<any> {
        
        const endpoint = `${websiteUrl}/umbraco/management/api/v1/item/document-type/search?query=${docType}&skip=0&take=1`;
        if (token === null) {
            new Notice('Bearer token is null. Please check your settings.');
            return null;
        }

        const obsidianDocTypeRaw = await CallUmbracoApi(endpoint, token, 'GET');
        if (!obsidianDocTypeRaw) {
            new Notice('Failed to fetch document type.');
            return null;
        }


        const jsonDocType = obsidianDocTypeRaw.json;
        if (jsonDocType && jsonDocType.items && jsonDocType.items.length > 0) {
            return jsonDocType.items[0]; // Return the first document type found
        } else {
            new Notice('No Obsidian document type found.');
        }
    }
