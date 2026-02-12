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
	useBlockList: boolean;
	blockListPropertyAlias: string;
	blockListElementTypeId: string;
	blockListElementTypeAlias: string;
	blockListContentPropertyAlias: string;
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
	useBlockList: false,
	blockListPropertyAlias: '',
	blockListElementTypeId: '',
	blockListElementTypeAlias: '',
	blockListContentPropertyAlias: '',
}


export interface DataProp {
	content: string;
}
