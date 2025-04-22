export interface UmbracidianSettings {
    mySetting: string;
    websiteUrl: string;
    blogParentNodeId: string;
    blogDocTypeAlias: string;
    clientId: string;
	clientSecret: string;
	blogContentAlias: string;
}

export const DEFAULT_SETTINGS: UmbracidianSettings = {
    mySetting: 'default',
    blogParentNodeId: 'null',
    blogDocTypeAlias: 'BlogPost',
    websiteUrl: 'https://example.com',
    clientId: 'your-client-id',
	clientSecret: 'your-client-secret',
	blogContentAlias: 'blogContent',
}

export interface ContentProp {
	title: string;
	tags?: string[];
	featured?: boolean;
	status: string;
	excerpt?: string | undefined;
	feature_image?: string;
}

export interface DataProp {
	content: string;
}
