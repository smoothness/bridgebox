import 'server-only'

import { createApiClient } from '@bridgebox/api-client'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
	isAuthError,
	requireBackofficeAccess,
} from '../../../lib/utils/auth/auth'

type ApiClient = ReturnType<typeof createApiClient>
export type Tenant = Awaited<ReturnType<ApiClient['listTenants']>>[number]

async function requireBackofficeAccessOrRedirect() {
	try {
		await requireBackofficeAccess()
	} catch (error) {
		if (isAuthError(error)) {
			if (error.message === 'UNAUTHENTICATED') redirect('/login')
			redirect('/forbidden')
		}
		throw error
	}
}

async function createBackofficeTenantApiClient() {
	const cookieStore = await cookies()
	const idToken =
		cookieStore.get('bb_id_token')?.value ??
		cookieStore.get('bb_access_token')?.value

	const apiBaseUrl = process.env.API_BASE_URL ?? ''
	return createApiClient({ baseUrl: apiBaseUrl, authToken: idToken })
}

export async function listTenantsForBackoffice(): Promise<{
	tenants: Tenant[]
	fetchError?: string
}> {
	await requireBackofficeAccessOrRedirect()
	const client = await createBackofficeTenantApiClient()

	try {
		const tenants = await client.listTenants()
		return { tenants }
	} catch {
		return {
			tenants: [],
			fetchError: 'Failed to load tenants.',
		}
	}
}

export async function getTenantByIdForBackoffice(tenantId: string): Promise<{
	tenant?: Tenant
	fetchError?: string
}> {
	await requireBackofficeAccessOrRedirect()
	const client = await createBackofficeTenantApiClient()

	try {
		const allTenants = await client.listTenants()
		const tenant = allTenants.find((item) => item.tenantId === tenantId)

		if (!tenant) {
			return { fetchError: 'Tenant not found.' }
		}

		return { tenant }
	} catch {
		return { fetchError: 'Failed to load tenant.' }
	}
}
