export interface umbpublisherSettings {
    mySetting: string;
    websiteUrl: string;
    blogParentNodeId: string;
    blogDocTypeAlias: string;
    clientId: string;
	clientSecret: string;
	titleAlias: string;
	blogContentAlias: string;
}

export const DEFAULT_SETTINGS: umbpublisherSettings = {
    mySetting: 'default',
    blogParentNodeId: 'null',
    blogDocTypeAlias: 'BlogPost',
    websiteUrl: 'https://example.com',
    clientId: 'your-client-id',
	clientSecret: 'your-client-secret',
	titleAlias: 'title',
	blogContentAlias: 'blogContent',
}


export interface DataProp {
	content: string;
}
