import { requestUrl, Notice, RequestUrlResponse } from 'obsidian';

// Umbraco error response schema
interface UmbracoErrorResponse {
	type: string;
	title: string;
	status: number;
	detail: string;
	instance: string;
}

export async function CallUmbracoApi(endpoint: string, bearerToken: string,  method = 'GET', body?: unknown): Promise<RequestUrlResponse | null> {
	
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
	catch (error: unknown) {
		const err = error as { response?: string | Record<string, unknown>; status?: number; message?: string };

		// Try to extract Umbraco-specific error details
		let umbracoError: UmbracoErrorResponse | null = null;
		try {
			if (err.response && typeof err.response === 'string') {
				umbracoError = JSON.parse(err.response) as UmbracoErrorResponse;
			} else if (err.response && typeof err.response === 'object') {
				umbracoError = err.response as UmbracoErrorResponse;
			}
		} catch (parseError) {
		}
		
		if (umbracoError) {
			new Notice(`Umbraco API Error (${umbracoError.status}): ${umbracoError.title}\nDetail: ${umbracoError.detail}\nEndpoint: ${endpoint}`);
		} else if (err.status === 404) {
			new Notice(`404 Error - Endpoint not found: ${endpoint}\nCheck if the Management API is enabled and the URL is correct.`);
		} else if (err.status === 401) {
			new Notice('401 Error - Authentication failed. Check your client credentials.');
		} else if (err.status === 403) {
			new Notice('403 Error - Access forbidden. Check your API permissions.');
		} else {
			new Notice(`API Error (${err.status || 'Unknown'}): ${err.message}\nEndpoint: ${endpoint}`);
		}
		
		return null;
	}
}
