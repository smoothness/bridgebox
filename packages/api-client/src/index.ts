type ApiClientOptions = {
	baseUrl: string
	apiKey?: string
}

export function createApiClient({ baseUrl, apiKey }: ApiClientOptions) {
	return {
		async get<T>(path: string) {
			const response = await fetch(`${baseUrl}${path}`, {
				headers: apiKey ? { 'x-api-key': apiKey } : undefined,
			})
			if (!response.ok) throw new Error(`API_ERROR_${response.status}`)
			return (await response.json()) as T
		},
	}
}
