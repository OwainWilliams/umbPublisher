import { requestUrl, Notice } from 'obsidian';

export class UmbracoApiService {
    private bearerToken: string | null = null;
    private websiteUrl: string;
    private clientId: string;
    private clientSecret: string;

    constructor(websiteUrl: string, clientId: string, clientSecret: string) {
        this.websiteUrl = websiteUrl;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    async getBearerToken(): Promise<string | null> {
        if (this.bearerToken) return this.bearerToken;

        const tokenEndpoint = `${this.websiteUrl}/umbraco/management/api/v1/security/back-office/token`;
        
        if (!this.clientId || !this.clientSecret) {
            new Notice('Missing CLIENT_ID or CLIENT_SECRET in settings.');
            return null;
        }

        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });

        try {
            const response = await requestUrl({
                url: tokenEndpoint,
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });

            if (response.json) {
                this.bearerToken = (response.json as any).access_token;
                return this.bearerToken;
            }
            return null;
        } catch (error) {
            console.error('Token error:', error);
            new Notice(`Error fetching bearer token: ${error}`);
            return null;
        }
    }

    async callApi<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T | null> {
        const token = await this.getBearerToken();
        if (!token) return null;

        const url = `${this.websiteUrl}${endpoint}`;
        
        try {
            console.log(`Making API call: ${method} ${url}`);
            if (body) {
                console.log('Request body:', JSON.stringify(body, null, 2));
            }

            const response = await requestUrl({
                url,
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: body ? JSON.stringify(body) : undefined,
                throw: false // Don't throw on HTTP errors, handle them manually
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            console.log('Raw response text:', response.text);

            // Check for HTTP error status codes
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.text || 'Unknown error'}`);
            }

            // Handle empty response (which is common for successful POST/PUT operations)
            if (!response.text || response.text.trim() === '') {
                console.log('Empty response received - treating as success for POST/PUT');
                if (method === 'POST' || method === 'PUT') {
                    return { success: true, status: response.status } as unknown as T;
                }
                return null;
            }

            // Try to parse JSON manually
            try {
                const jsonResponse = JSON.parse(response.text);
                console.log('Parsed JSON response:', jsonResponse);
                return jsonResponse as T;
            } catch (jsonError) {
                console.error('Failed to parse JSON response:', jsonError);
                console.log('Response text that failed to parse:', response.text);
                
                // If it's a successful status code but invalid JSON, still treat as success
                if (response.status >= 200 && response.status < 300) {
                    console.log('Successful status with non-JSON response, treating as success');
                    return { success: true, status: response.status, rawResponse: response.text } as unknown as T;
                }
                
                throw new Error(`Invalid JSON response: ${response.text}`);
            }

        } catch (error) {
            console.error(`API call failed:`, {
                endpoint: url,
                method,
                status: error.status || 'unknown',
                error: error.message || 'Unknown error',
            });
            throw error;
        }
    }

    async uploadFile(endpoint: string, fileData: ArrayBuffer, fileName: string, mimeType: string, id?: string): Promise<any> {
        const token = await this.getBearerToken();
        if (!token) throw new Error('Failed to get bearer token');

        const url = `${this.websiteUrl}${endpoint}`;
        
        try {
            // Create a proper boundary
            const boundary = '----ObsidianFormBoundary' + Date.now().toString(16);
            
            // Build multipart form data with proper CRLF line endings
            const CRLF = '\r\n';
            const encoder = new TextEncoder();
            
            let bodyParts: Uint8Array[] = [];
            
            // Add id field if provided
            if (id) {
                let idPart = '';
                idPart += `--${boundary}${CRLF}`;
                idPart += `Content-Disposition: form-data; name="id"${CRLF}`;
                idPart += CRLF;
                idPart += id;
                idPart += CRLF;
                bodyParts.push(encoder.encode(idPart));
            }
            
            // Add file field
            let filePart = '';
            filePart += `--${boundary}${CRLF}`;
            filePart += `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}`;
            filePart += `Content-Type: ${mimeType}${CRLF}`;
            filePart += CRLF;
            
            bodyParts.push(encoder.encode(filePart));
            bodyParts.push(new Uint8Array(fileData));
            
            // Add closing boundary
            const footer = `${CRLF}--${boundary}--${CRLF}`;
            bodyParts.push(encoder.encode(footer));
            
            // Combine all parts
            const totalLength = bodyParts.reduce((sum, part) => sum + part.length, 0);
            const fullBody = new Uint8Array(totalLength);
            let offset = 0;
            for (const part of bodyParts) {
                fullBody.set(part, offset);
                offset += part.length;
            }

            console.log('Upload URL:', url);
            console.log('Boundary:', boundary);
            console.log('ID:', id);
            console.log('File size:', fileData.byteLength);
            console.log('Total body size:', fullBody.length);
            
            // Debug: show first 300 bytes
            const preview = new TextDecoder().decode(fullBody.slice(0, 300));
            console.log('Body preview:', preview);

            const response = await requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                body: fullBody.buffer,
                throw: false
            });

            console.log('Upload response status:', response.status);
            console.log('Upload response text:', response.text);

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.text}`);
            }

            // Handle empty or non-JSON responses
            if (!response.text || response.text.trim() === '') {
                console.log('Empty response received - file uploaded successfully');
                return { success: true, status: response.status };
            }

            // Try to parse JSON if there's content
            try {
                return JSON.parse(response.text);
            } catch (jsonError) {
                console.log('Non-JSON response received:', response.text);
                return { success: true, status: response.status, rawResponse: response.text };
            }
        } catch (error) {
            console.error('File upload failed:', error);
            throw error;
        }
    }

    async uploadBinary(endpoint: string, fileData: ArrayBuffer, mimeType: string): Promise<any> {
        const token = await this.getBearerToken();
        if (!token) throw new Error('Failed to get bearer token');

        const url = `${this.websiteUrl}${endpoint}`;
        
        try {
            console.log('Uploading binary to:', url);
            console.log('Content-Type:', mimeType);
            console.log('Data size:', fileData.byteLength);

            const response = await requestUrl({
                url,
                method: 'PUT',  // Changed from POST to PUT
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': mimeType
                },
                body: fileData,
                throw: false
            });

            console.log('Binary upload response status:', response.status);
            console.log('Binary upload response text:', response.text);

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.text}`);
            }

            // Handle empty or non-JSON responses
            if (!response.text || response.text.trim() === '') {
                console.log('Empty response received - binary uploaded successfully');
                return { success: true, status: response.status };
            }

            // Try to parse JSON if there's content
            try {
                return JSON.parse(response.text);
            } catch (jsonError) {
                console.log('Non-JSON response received:', response.text);
                return { success: true, status: response.status, rawResponse: response.text };
            }
        } catch (error) {
            console.error('Binary upload failed:', error);
            throw error;
        }
    }

    clearToken(): void {
        this.bearerToken = null;
    }
}