import {
	isAuthError,
	verifyCognitoTokenAndBuildSession,
	AuthError,
	type Session,
} from '@bridgebox/auth'
import {
	getMembershipByEmailAndApp,
	getMembershipByPrincipalIdAndApp,
} from '../../../../core/src/dynamo'
import { cookies, headers } from 'next/headers'



function extractBearerToken(authHeader: string | null) {
	if (!authHeader?.startsWith('Bearer ')) return null
	return authHeader.slice('Bearer '.length).trim()
}

export async function getBackofficeSession(): Promise<Session> {
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
		const cognitoSession = await verifyCognitoTokenAndBuildSession({
			token,
			userPoolId: userPoolId as string,
			clientId: clientId as string,
		})
		let membershipBySub
		try {
			membershipBySub = await getMembershipByPrincipalIdAndApp(
				cognitoSession.claims.sub,
				'backoffice',
			)
		} catch {
			throw new AuthError('FORBIDDEN')
		}
		let membership = membershipBySub
		if (!membership && cognitoSession.claims.email) {
			try {
				membership = await getMembershipByEmailAndApp(
					cognitoSession.claims.email,
					'backoffice',
				)
			} catch {
				throw new AuthError('FORBIDDEN')
			}
		}

		if (!membership) {
			throw new AuthError('FORBIDDEN')
		}

		return {
			...cognitoSession,
			user: {
				userId: membership.principalId,
				role: membership.role,
				tenantId: membership.tenantId,
			},
			claims: {
				...cognitoSession.claims,
				role: membership.role,
				tenantId: membership.tenantId,
				email: membership.email,
			},
		}
	}
	throw new AuthError('UNAUTHENTICATED')
}

export async function requireBackofficeAccess() {
	const session = await getBackofficeSession()
	if (session.user.role !== 'platform_admin') {
		throw new AuthError('FORBIDDEN')
	}
	return session
}

export { isAuthError }
