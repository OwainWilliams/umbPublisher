import { Notice } from 'obsidian';
import { CallUmbracoApi } from './callUmbracoApi';

/**
 * Get BlockList element types allowed for a specific BlockList property
 */
export async function GetBlockListElementTypes(
    docTypeId: string,
    blockPropertyAlias: string,
    websiteUrl: string,
    token: string
): Promise<any[]> {
    // First, get the document type details to find the BlockList property
    const endpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${docTypeId}`;

    if (token === null) {
        new Notice('Bearer token is null. Please check your settings.');
        return [];
    }

    const docTypeRaw = await CallUmbracoApi(endpoint, token, 'GET');
    if (!docTypeRaw) {
        new Notice('Failed to fetch document type.');
        return [];
    }

    const docType = docTypeRaw.json;

    // Collect all properties: direct + from compositions
    let properties: any[] = docType.properties || [];
    if (docType.compositions) {
        for (const comp of docType.compositions) {
            if (comp.properties) {
                properties = properties.concat(comp.properties);
            }
            // Compositions may only be references - fetch the full document type
            const compDocTypeId = comp.documentType?.id || comp.id;
            if (compDocTypeId) {
                const compEndpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${compDocTypeId}`;
                const compRaw = await CallUmbracoApi(compEndpoint, token, 'GET');
                if (compRaw?.json?.properties) {
                    properties = properties.concat(compRaw.json.properties);
                }
            }
        }
    }

    // Find the BlockList property
    const blockListProperty = properties.find((p: any) => p.alias === blockPropertyAlias);

    if (!blockListProperty) {
        new Notice(`BlockList property '${blockPropertyAlias}' not found on document type.`);
        return [];
    }

    // The property only contains a reference to the data type by ID
    // We need to fetch the full data type details to get editorAlias and configuration
    const dataTypeId = blockListProperty.dataType?.id;

    if (!dataTypeId) {
        new Notice(`Property '${blockPropertyAlias}' has no data type ID.`);
        return [];
    }

    // Fetch the full data type details
    const dataTypeEndpoint = `${websiteUrl}/umbraco/management/api/v1/data-type/${dataTypeId}`;
    const dataTypeRaw = await CallUmbracoApi(dataTypeEndpoint, token, 'GET');

    if (!dataTypeRaw) {
        new Notice('Failed to fetch data type details.');
        return [];
    }

    const dataType = dataTypeRaw.json;

    // Check if it's a BlockList or BlockGrid property
    const editorAlias = dataType.editorAlias || '';
    const isBlockEditor =
        editorAlias.includes('BlockList') ||
        editorAlias.includes('Block.List') ||
        editorAlias.includes('BlockGrid') ||
        editorAlias.includes('Block.Grid');

    if (!isBlockEditor) {
        new Notice(`Property '${blockPropertyAlias}' is not a Block List or Block Grid property. Editor alias: ${editorAlias}`);
        return [];
    }

    // Extract allowed element types from the BlockList configuration
    // The structure is: values[].value[] where alias === "blocks"
    const values = dataType.values || [];
    const blocksConfig = values.find((v: any) => v.alias === 'blocks');

    if (!blocksConfig || !blocksConfig.value || blocksConfig.value.length === 0) {
        new Notice('No element types configured for this BlockList property.');
        return [];
    }

    // Fetch each element type to get its real name
    const elementTypes: any[] = [];
    for (const block of blocksConfig.value) {
        const elementTypeId = block.contentElementTypeKey;
        if (!elementTypeId) continue;

        const etEndpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${elementTypeId}`;
        const etRaw = await CallUmbracoApi(etEndpoint, token, 'GET');
        const name = etRaw?.json?.name || block.label || 'Unknown';

        elementTypes.push({
            id: elementTypeId,
            name: name,
            alias: etRaw?.json?.alias || '',
        });
    }

    return elementTypes;
}

/**
 * Get element type details by ID
 * Element types are actually document types in Umbraco, so we use the document-type endpoint
 */
export async function GetElementTypeById(
    elementTypeId: string,
    websiteUrl: string,
    token: string
): Promise<any> {
    // Element types are document types, so use the document-type endpoint
    const endpoint = `${websiteUrl}/umbraco/management/api/v1/document-type/${elementTypeId}`;

    if (token === null) {
        new Notice('Bearer token is null. Please check your settings.');
        return null;
    }

    const elementTypeRaw = await CallUmbracoApi(endpoint, token, 'GET');
    if (!elementTypeRaw) {
        new Notice('Failed to fetch element type by ID.');
        return null;
    }

    return elementTypeRaw.json;
}

/**
 * Auto-detect the best property for content on an element type
 * Since properties only have dataType.id (not editorAlias), we search by property name/alias
 */
export function FindContentProperty(properties: any[]): any | null {
    if (!properties || properties.length === 0) {
        return null;
    }

    // Common content property names/aliases (case-insensitive)
    const contentPropertyNames = [
        'markdown',
        'content',
        'text',
        'richText',
        'bodyText',
        'body',
        'copy',
        'description'
    ];

    // Try to find a property with a common content-related alias
    for (const name of contentPropertyNames) {
        const property = properties.find(
            (p: any) => p.alias?.toLowerCase() === name.toLowerCase()
        );
        if (property) {
            return property;
        }
    }

    // If no match found by exact alias, try partial match
    for (const name of contentPropertyNames) {
        const property = properties.find(
            (p: any) => p.alias?.toLowerCase().includes(name.toLowerCase())
        );
        if (property) {
            return property;
        }
    }

    // If still no match, return the first property as fallback
    if (properties.length > 0) {
        return properties[0];
    }

    return null;
}
