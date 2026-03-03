import {
	buildSessionFromClaims,
	isAuthError,
	requireRole,
	requireTenantContext,
	verifyCognitoTokenAndBuildSession,
	AuthError,
	type Session,
} from '@bridgebox/auth'
import { cookies, headers } from 'next/headers'
function extractBearerToken(authHeader: string | null) {
	if (!authHeader?.startsWith('Bearer ')) return null
	return authHeader.slice('Bearer '.length).trim()
}

export async function getPortalSession(): Promise<Session> {
	const headerStore = await headers()
	const cookieStore = await cookies()
	const authHeader = headerStore.get('authorization')
	const bearerToken = extractBearerToken(authHeader)
	const idToken = cookieStore.get('bb_id_token')?.value
	const accessToken = cookieStore.get('bb_access_token')?.value
	const token = bearerToken ?? idToken ?? accessToken ?? null

	const userPoolId = process.env.COGNITO_USER_POOL_ID
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const hasCognitoConfig = Boolean(userPoolId && clientId)

	if (token && hasCognitoConfig) {
		return verifyCognitoTokenAndBuildSession({
			token,
			userPoolId: userPoolId as string,
			clientId: clientId as string,
		})
	}

	const isLocalDev = process.env.NODE_ENV === 'development'
	if (!isLocalDev) {
		throw new AuthError('UNAUTHENTICATED')
	}

	const userId =
		headerStore.get('x-user-id') ??
		cookieStore.get('bb_user_id')?.value ??
		'local-dev-user'
	const roleValue =
		headerStore.get('x-user-role') ??
		cookieStore.get('bb_role')?.value ??
		'tenant_admin'
	const tenantId =
		headerStore.get('x-tenant-id') ??
		cookieStore.get('bb_tenant_id')?.value ??
		'tenant-dev'

	const session = buildSessionFromClaims({
		sub: userId,
		role: roleValue === 'tenant_user' ? 'tenant_user' : 'tenant_admin',
		tenantId,
	})

	return session
}

export async function requirePortalAccess() {
	const session = await getPortalSession()
	requireRole(session, ['tenant_user', 'tenant_admin'])
	requireTenantContext(session)
	return session
}

export { isAuthError }
