export type ContentMode = 'propertyEditor' | 'blockList' | 'blockGrid';

export interface UmbracoProperty {
	alias: string;
	name?: string;
	dataType?: {
		id?: string;
		editorAlias?: string;
	};
}

export interface UmbracoComposition {
	properties?: UmbracoProperty[];
	documentType?: { id: string };
	id?: string;
}

export interface UmbracoDocType {
	id?: string;
	name?: string;
	alias?: string;
	properties?: UmbracoProperty[];
	compositions?: UmbracoComposition[];
}

export interface UmbracoDataTypeValue {
	alias: string;
	value?: UmbracoBlock[];
}

export interface UmbracoBlock {
	contentElementTypeKey?: string;
	label?: string;
}

export interface UmbracoDataType {
	editorAlias?: string;
	values?: UmbracoDataTypeValue[];
}

export interface UmbracoElementTypeSummary {
	id: string;
	name: string;
	alias: string;
}

export interface UmbracoContentNode {
	id: string;
	depth: number;
	variants: Array<{ name: string; culture?: string | null; segment?: string | null }>;
	documentType: { id: string; alias?: string };
}

export interface UmbracoAllowedChildDocType {
	id: string;
	name: string;
}

export interface TokenResponse {
	access_token: string;
}

export interface umbpublisherSettings {
    mySetting: string;
    websiteUrl: string;
    blogParentNodeId: string;
    blogDocTypeAlias: string;
    blogDocTypeId: string;
    clientId: string;
	clientSecret: string;
	titleAlias: string;
	blogContentAlias: string;
	tagsAlias: string;
	contentMode: ContentMode;
	blockPropertyAlias: string;
	blockElementTypeId: string;
	blockElementTypeAlias: string;
	blockContentPropertyAlias: string;
}

export const DEFAULT_SETTINGS: umbpublisherSettings = {
    mySetting: 'default',
    blogParentNodeId: 'null',
    blogDocTypeAlias: 'BlogPost',
    blogDocTypeId: '',
    websiteUrl: 'https://example.com',
    clientId: 'your-client-id',
	clientSecret: 'your-client-secret',
	titleAlias: 'title',
	blogContentAlias: 'blogContent',
	tagsAlias: '',
	contentMode: 'propertyEditor',
	blockPropertyAlias: '',
	blockElementTypeId: '',
	blockElementTypeAlias: '',
	blockContentPropertyAlias: '',
}


export interface DataProp {
	content: string;
}
