import {
	AuthError,
	requireRole,
	verifyCognitoTokenAndBuildSession,
} from '@bridgebox/auth'
import {
	getMembershipByEmailAndApp,
	getMembershipByPrincipalIdAndApp,
} from '@bridgebox/core/dynamo'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'

/**
 * Verifies the Bearer token in the Authorization header and asserts the caller
 * has the platform_admin role. Throws AuthError on failure.
 */
export async function requirePlatformAdmin(event: APIGatewayProxyEventV2) {
	const authHeader =
		event.headers.authorization ?? event.headers.Authorization
	if (!authHeader?.startsWith('Bearer ')) {
		throw new AuthError('UNAUTHENTICATED')
	}
	const token = authHeader.slice('Bearer '.length).trim()

	const userPoolId = process.env.COGNITO_USER_POOL_ID
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	if (!userPoolId || !clientId) {
		throw new Error('Missing COGNITO_USER_POOL_ID or COGNITO_APP_CLIENT_ID')
	}

	const session = await verifyCognitoTokenAndBuildSession({
		token,
		userPoolId,
		clientId,
	})

	// Primary check: Cognito claim/group role.
	try {
		requireRole(session, ['platform_admin'])
		return session
	} catch {
		// Fallback for existing users whose platform_admin role is stored as
		// backoffice membership in DynamoDB rather than Cognito custom claims.
		const membershipBySub = await getMembershipByPrincipalIdAndApp(
			session.claims.sub,
			'backoffice',
		)
		let membership = membershipBySub
		if (!membership && session.claims.email) {
			membership = await getMembershipByEmailAndApp(
				session.claims.email,
				'backoffice',
			)
		}
		if (!membership || membership.role !== 'platform_admin') {
			throw new AuthError('FORBIDDEN')
		}
	}
	return session
}

export function jsonResponse(statusCode: number, body: unknown) {
	return {
		statusCode,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	}
}

export function errorResponse(err: unknown) {
	if (err instanceof AuthError) {
		if (err.message === 'UNAUTHENTICATED') {
			return jsonResponse(401, { error: 'Unauthenticated' })
		}
		if (err.message === 'FORBIDDEN') {
			return jsonResponse(403, { error: 'Forbidden' })
		}
	}
	console.error(err)
	return jsonResponse(500, { error: 'Internal server error' })
}
