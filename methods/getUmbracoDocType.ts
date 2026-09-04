import { Notice } from 'obsidian';
import { CallUmbracoApi } from './callUmbracoApi';
import { UmbracoDocType, UmbracoAllowedChildDocType } from '../types/index';

export async function GetUmbracoDocTypeById(docTypeId: string, websiteUrl: string, token: string): Promise<UmbracoDocType | null> {
        const endpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${docTypeId}`;
        if (!token) {
            new Notice('Bearer token is null. Please check your settings.');
            return null;
        }
        const docTypeRaw = await CallUmbracoApi(endpoint, token, 'GET');
        if (!docTypeRaw) {
            new Notice('Failed to fetch document type by ID.');
            return null;
        }
        return docTypeRaw.json as UmbracoDocType; // Return the document type details
}
 
export async function GetAllowedChildDocTypes(docTypeId: string, websiteUrl: string, token: string): Promise<UmbracoAllowedChildDocType[]> {
    const endpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${docTypeId}/allowed-children`;
    
    
    if (!token) {
        new Notice('Bearer token is null. Please check your settings.');
        return [];
    }
    const umbracoAllowedChildDocTypesRaw = await CallUmbracoApi(endpoint, token, 'GET');
    if (!umbracoAllowedChildDocTypesRaw) {
        new Notice('Failed to fetch allowed child document types.');
        return [];
    }
    const jsonAllowedChildDocTypes = umbracoAllowedChildDocTypesRaw.json as { items?: UmbracoAllowedChildDocType[] };
    if (jsonAllowedChildDocTypes && jsonAllowedChildDocTypes.items) {
        return jsonAllowedChildDocTypes.items; // Return the list of allowed child document types
    } else {
        new Notice('No allowed child document types found.');
        return [];
    }
}