import { Notice } from 'obsidian';
import { CallUmbracoApi } from './callUmbracoApi';
import { get } from 'http';


export async function GetUmbracoSiteNodes(docType: string, websiteUrl: string, token: any): Promise<any> {
        
    const siteRootId = "";
    
    if (websiteUrl.endsWith('/')) {
        websiteUrl = websiteUrl.slice(0, -1);
    }

    const endpoint = `${websiteUrl}/umbraco/management/api/v1/tree/document/root`;
        if (token === null) {
            new Notice('Bearer token is null. Please check your settings.');
            return null;
        }

        const siteRootJson = await CallUmbracoApi(endpoint, token, 'GET');
        if (!siteRootJson) {
            new Notice('Failed to fetch siteRoot.');
            return null;
        }


        const jsonObj = siteRootJson.json;

        // check if jsonObj has a value for id
        if (jsonObj && jsonObj.items[0].id) {
          const children =  await getChildren(jsonObj.items[0].id)
        } else {
            new Notice('No Obsidian document type found.');
        }


        async function getChildren(id: string) {
            const endpoint = `${websiteUrl}/umbraco/management/api/v1/tree/document/children?parentId=${id}&skip=0&take=100`;
            const childrenJson = await CallUmbracoApi(endpoint, token, 'GET');

            // If childrenJson has items, return all items, get name of item and id of itme, put in an array
            if (childrenJson && childrenJson.json && childrenJson.json.items) {
                const items = childrenJson.json.items;
                const obsidianDocTypes = items.map((item: any) => {

                    // get name from item.vairiants[0].name
                    
                    const name = item.variants && item.variants.length > 0 ? item.variants[0].name : null;
                    return {
                        name: name,
                        id: item.id
                    };
                });
                return obsidianDocTypes;
            } else {
                new Notice('No children found.');
            }

            return childrenJson;
        }
    }
