import { isAuthError } from '@bridgebox/auth'
import {
	getMembershipByEmailAndApp,
	putMembership,
} from '../../../../../core/src/dynamo'
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
	const principalIdRaw = String(formData.get('principalId') ?? '').trim()
	const email = String(formData.get('email') ?? '').trim().toLowerCase()
	const appTarget = String(formData.get('appTarget') ?? '').trim()
	const role = String(formData.get('role') ?? '').trim()
	const tenantId = String(formData.get('tenantId') ?? '').trim()

	if (!email) {
		return NextResponse.redirect(new URL('/?error=membership_email_required', request.url))
	}
	if (appTarget !== 'portal' && appTarget !== 'backoffice') {
		return NextResponse.redirect(new URL('/?error=membership_invalid_app', request.url))
	}
	if (
		role !== 'tenant_user' &&
		role !== 'tenant_admin' &&
		role !== 'platform_admin'
	) {
		return NextResponse.redirect(new URL('/?error=membership_invalid_role', request.url))
	}
	if (
		appTarget === 'portal' &&
		role !== 'tenant_user' &&
		role !== 'tenant_admin'
	) {
		return NextResponse.redirect(
			new URL('/?error=membership_invalid_portal_role', request.url),
		)
	}
	if (appTarget === 'portal' && !tenantId) {
		return NextResponse.redirect(
			new URL('/?error=membership_tenant_required', request.url),
		)
	}
	if (appTarget === 'backoffice' && role !== 'platform_admin') {
		return NextResponse.redirect(
			new URL('/?error=membership_invalid_backoffice_role', request.url),
		)
	}

	let principalId = principalIdRaw
	if (!principalId) {
		const existing = await getMembershipByEmailAndApp(email, appTarget)
		if (!existing) {
			return NextResponse.redirect(
				new URL('/?error=membership_principal_required', request.url),
			)
		}
		principalId = existing.principalId
	}

	await putMembership({
		principalId,
		email,
		app: appTarget,
		role,
		tenantId: appTarget === 'portal' ? tenantId : undefined,
	})

	const successUrl = new URL('/', request.url)
	successUrl.searchParams.set('membership_created', '1')
	successUrl.searchParams.set('membership_app', appTarget)
	successUrl.searchParams.set('membership_email', email)
	return NextResponse.redirect(successUrl)
}
