import { randomUUID } from 'node:crypto'
import { isAuthError } from '@bridgebox/auth'
import { putTenant } from '../../../../../core/src/dynamo'
import { requireBackofficeAccess } from '../../../../lib/utils/auth/auth'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
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

	const formData = await request.formData()
	const tenantName = String(formData.get('tenantName') ?? '').trim()
	const tenantPlan = String(formData.get('tenantPlan') ?? '').trim() || 'starter'
	const tenantChannel = String(formData.get('tenantChannel') ?? 'instagram').trim()
	const channel =
		tenantChannel === 'facebook' || tenantChannel === 'whatsapp'
			? tenantChannel
			: 'instagram'

	if (!tenantName) {
		return NextResponse.redirect(new URL('/?error=tenant_name_required', request.url))
	}

	const tenantId = randomUUID()
	await putTenant({
		tenantId,
		platformAccountId: `UNLINKED#${tenantId}`,
		channel,
		name: tenantName,
		plan: tenantPlan,
		accessToken: 'UNLINKED',
	})

	const successUrl = new URL('/', request.url)
	successUrl.searchParams.set('tenant_created', '1')
	successUrl.searchParams.set('tenant_id', tenantId)
	return NextResponse.redirect(successUrl)
}
