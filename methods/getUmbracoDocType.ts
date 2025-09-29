import { Notice } from 'obsidian';
import { CallUmbracoApi } from './callUmbracoApi';

// export async function GetUmbracoDocType(docType: string, websiteUrl: string, token: any): Promise<any> {
        
//         const endpoint = `${websiteUrl}/umbraco/management/api/v1/item/document-type/search?query=${docType}&skip=0&take=1`;
  
//         if (token === null) {
//             new Notice('Bearer token is null. Please check your settings.');
//             return null;
//         }

//         const obsidianDocTypeRaw = await CallUmbracoApi(endpoint, token, 'GET');
              
//         if (!obsidianDocTypeRaw) {
//             new Notice('Failed to fetch document type from Umbraco.');
//             return null;
//         }

       
//         const jsonDocType = obsidianDocTypeRaw.json;
//         if (jsonDocType && jsonDocType.items && jsonDocType.items.length > 0) {
//             return jsonDocType.items[0]; // Return the first document type found
//         } else {
//             new Notice('No document type found in Umbraco.');
//             return null;
//         }
// }

export async function GetUmbracoDocTypeById(docTypeId: string, websiteUrl: string, token: any): Promise<any> {
        console.log('Fetching document type by ID:', docTypeId);    
        const endpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${docTypeId}`;
        if (token === null) {
            new Notice('Bearer token is null. Please check your settings.');
            return null;
        }
;
        const docTypeRaw = await CallUmbracoApi(endpoint, token, 'GET');
        if (!docTypeRaw) {
            new Notice('Failed to fetch document type by ID.');
            return null;
        }

        return docTypeRaw.json; // Return the document type details
}
 
export async function GetAllowedChildDocTypes(docTypeId: string, websiteUrl: string, token: any): Promise<any[]> {
    const endpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${docTypeId}/allowed-children`;
    
    
    if (token === null) {
        new Notice('Bearer token is null. Please check your settings.');
        return [];
    }
    const umbracoAllowedChildDocTypesRaw = await CallUmbracoApi(endpoint, token, 'GET');
    if (!umbracoAllowedChildDocTypesRaw) {
        new Notice('Failed to fetch allowed child document types.');
        return [];
    }
    const jsonAllowedChildDocTypes = umbracoAllowedChildDocTypesRaw.json;
    if (jsonAllowedChildDocTypes && jsonAllowedChildDocTypes.items) {
        return jsonAllowedChildDocTypes.items; // Return the list of allowed child document types
    } else {
        new Notice('No allowed child document types found.');
        return [];
    }
}