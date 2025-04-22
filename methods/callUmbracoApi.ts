import { requestUrl, Notice } from 'obsidian';


export async function CallUmbracoApi(endpoint: string, bearerToken: string,  method = 'GET', body?: any): Promise<any> {
	
	const response = await requestUrl({
		url: `${endpoint}`,
		method,
		headers: {
			'Authorization': `Bearer ${bearerToken}`,
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (response.status === 201 || response.status === 200) {
		try {
			// Attempt to parse JSON if possible
			return response.json;
		} catch (jsonError) {
			// If JSON parsing fails, log a warning and return the raw response
			console.warn('Invalid JSON response:', response.text);
			new Notice('Invalid JSON response from API.');
			return { ok: true, status: response.status, text: response.text };
		}
	} else {
		// Handle non-OK status codes
		console.error('API call failed with status:', response.status);
		new Notice(`API call failed with status: ${response.status}`);

	}
}
