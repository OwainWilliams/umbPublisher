import { requestUrl, Notice } from 'obsidian';


export async function CallUmbracoApi(endpoint: string, bearerToken: string,  method = 'GET', body?: any): Promise<any> {
	
	if (!bearerToken) {
		new Notice('Bearer token is null. Please check your settings.');
		return null;
	}

	console.log(`Calling Umbraco API: ${method} ${endpoint} with body:`, body);
	
	try{
		const response = await requestUrl({
			url: `${endpoint}`,
			method,
			headers: {
				'Authorization': `Bearer ${bearerToken}`,
				'Content-Type': 'application/json',
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		return response; // Return the parsed JSON response
	}
	catch (error) {
		new Notice('Error in CallUmbracoApi: ' + error.message);
		console.error('Error in CallUmbracoApi:', error);
		return null;
	}
}
