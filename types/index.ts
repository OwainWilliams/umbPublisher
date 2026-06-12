export type ContentMode = 'propertyEditor' | 'blockList' | 'blockGrid';

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
