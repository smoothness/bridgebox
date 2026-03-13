import type {
	CreateTenantInput,
	TenantProfile,
	UpdateTenantInput,
} from '@bridgebox/domain'

type ApiClientOptions = {
	baseUrl: string
	/** x-api-key header for webhook/send-message routes */
	apiKey?: string
	/** Bearer token for JWT-protected routes (tenant CRUD) */
	authToken?: string
}

export function createApiClient({
	baseUrl,
	apiKey,
	authToken,
}: ApiClientOptions) {
	function buildHeaders(contentType?: string) {
		const headers: Record<string, string> = {}
		if (apiKey) headers['x-api-key'] = apiKey
		if (authToken) headers.Authorization = `Bearer ${authToken}`
		if (contentType) headers['Content-Type'] = contentType
		return Object.keys(headers).length ? headers : undefined
	}

	return {
		async get<T>(path: string) {
			const response = await fetch(`${baseUrl}${path}`, {
				headers: buildHeaders(),
			})
			if (!response.ok) throw new Error(`API_ERROR_${response.status}`)
			return (await response.json()) as T
		},

		async post<T>(path: string, body: unknown) {
			const response = await fetch(`${baseUrl}${path}`, {
				method: 'POST',
				headers: buildHeaders('application/json'),
				body: JSON.stringify(body),
			})
			if (!response.ok) throw new Error(`API_ERROR_${response.status}`)
			return (await response.json()) as T
		},

		async patch<T>(path: string, body: unknown) {
			const response = await fetch(`${baseUrl}${path}`, {
				method: 'PATCH',
				headers: buildHeaders('application/json'),
				body: JSON.stringify(body),
			})
			if (!response.ok) throw new Error(`API_ERROR_${response.status}`)
			return (await response.json()) as T
		},

		// ─── Tenant CRUD (platform_admin only) ────────────────────────────────

		listTenants() {
			return this.get<TenantProfile[]>('/tenants')
		},

		createTenant(
			input: Omit<CreateTenantInput, 'operationalName'> & {
				operationalName?: string
			},
		) {
			return this.post<TenantProfile>('/tenants', input)
		},

		updateTenant(tenantId: string, input: UpdateTenantInput) {
			return this.patch<TenantProfile>(`/tenants/${tenantId}`, input)
		},
	}
}
