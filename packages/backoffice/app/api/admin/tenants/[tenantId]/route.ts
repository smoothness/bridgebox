import { createApiClient } from '@bridgebox/api-client'
import { isAuthError } from '@bridgebox/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireBackofficeAccess } from '../../../../../lib/utils/auth/auth'

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ tenantId: string }> },
) {
	try {
		await requireBackofficeAccess()
	} catch (error) {
		if (isAuthError(error)) {
			if (error.message === 'UNAUTHENTICATED') {
				return NextResponse.redirect(new URL('/login', request.url))
			}
			return NextResponse.redirect(new URL('/forbidden', request.url))
		}
		throw error
	}

	const { tenantId } = await params

	const cookieStore = await cookies()
	const idToken =
		cookieStore.get('bb_id_token')?.value ??
		cookieStore.get('bb_access_token')?.value
	if (!idToken) {
		return NextResponse.redirect(
			new URL(`/tenants/${tenantId}?error=missing_token`, request.url),
		)
	}

	const apiBaseUrl = process.env.API_BASE_URL
	if (!apiBaseUrl) {
		return NextResponse.redirect(
			new URL(`/tenants/${tenantId}?error=api_not_configured`, request.url),
		)
	}

	const formData = await request.formData()
	const contactName = String(formData.get('contactName') ?? '').trim()
	const contactEmail = String(formData.get('contactEmail') ?? '').trim()
	const country = String(formData.get('country') ?? '').trim()
	const plan = String(formData.get('plan') ?? '').trim()
	const status = String(formData.get('status') ?? '').trim()
	const businessName = String(formData.get('businessName') ?? '').trim()

	const client = createApiClient({ baseUrl: apiBaseUrl, authToken: idToken })
	try {
		await client.updateTenant(tenantId, {
			contactName: contactName || undefined,
			contactEmail: contactEmail || undefined,
			country: country || undefined,
			plan: (plan || undefined) as 'solo' | 'agency_basic' | 'agency_pro' | undefined,
			status: (status || undefined) as 'active' | 'suspended' | undefined,
			businessName: businessName || null,
		})
		return NextResponse.redirect(
			new URL(`/tenants/${tenantId}?saved=1`, request.url),
		)
	} catch (err) {
		console.error('Failed to update tenant:', err)
		return NextResponse.redirect(
			new URL(`/tenants/${tenantId}?error=update_failed`, request.url),
		)
	}
}
