import { requestUrl, Notice } from 'obsidian';

// Umbraco error response schema
interface UmbracoErrorResponse {
	type: string;
	title: string;
	status: number;
	detail: string;
	instance: string;
}

export async function CallUmbracoApi(endpoint: string, bearerToken: string,  method = 'GET', body?: any): Promise<any> {
	
	if (!bearerToken) {
		new Notice('Bearer token is null. Please check your settings.');
		return null;
	}
	
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
	catch (error: any) {
		console.error('CallUmbracoApi Error Details:', {
			endpoint,
			method,
			error: error.message,
			status: error.status,
			response: error.response
		});
		
		// Try to extract Umbraco-specific error details
		let umbracoError: UmbracoErrorResponse | null = null;
		try {
			if (error.response && typeof error.response === 'string') {
				umbracoError = JSON.parse(error.response) as UmbracoErrorResponse;
			} else if (error.response && typeof error.response === 'object') {
				umbracoError = error.response as UmbracoErrorResponse;
			}
		} catch (parseError) {
			console.warn('Could not parse Umbraco error response:', parseError);
		}
		
		if (umbracoError) {
			console.error('Umbraco Error Details:', umbracoError);
			new Notice(`Umbraco API Error (${umbracoError.status}): ${umbracoError.title}\nDetail: ${umbracoError.detail}\nEndpoint: ${endpoint}`);
		} else if (error.status === 404) {
			new Notice(`404 Error - Endpoint not found: ${endpoint}\nCheck if the Management API is enabled and the URL is correct.`);
		} else if (error.status === 401) {
			new Notice('401 Error - Authentication failed. Check your client credentials.');
		} else if (error.status === 403) {
			new Notice('403 Error - Access forbidden. Check your API permissions.');
		} else {
			new Notice(`API Error (${error.status || 'Unknown'}): ${error.message}\nEndpoint: ${endpoint}`);
		}
		
		return null;
	}
}
