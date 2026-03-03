import { createHash, randomBytes } from 'node:crypto'
import type { Role, UserContext } from '@bridgebox/domain'
import { CognitoJwtVerifier } from 'aws-jwt-verify'

export type AuthClaims = {
	sub: string
	role: Role
	tenantId?: string
	email?: string
}

export type Session = {
	user: UserContext
	claims: AuthClaims
}

type VerifyCognitoTokenInput = {
	token: string
	userPoolId: string
	clientId: string
}

type CognitoPayload = {
	sub: string
	email?: string
	'custom:tenant_id'?: string
	'custom:role'?: string
	'cognito:groups'?: string[]
}

export type SocialProvider = 'Google' | 'Facebook'

type BuildHostedUiAuthorizeUrlInput = {
	domain: string
	clientId: string
	redirectUri: string
	state: string
	codeChallenge: string
	provider?: SocialProvider
}

type ExchangeCodeForTokensInput = {
	domain: string
	clientId: string
	redirectUri: string
	code: string
	codeVerifier: string
}

export type CognitoTokenResponse = {
	access_token: string
	id_token: string
	refresh_token?: string
	token_type: string
	expires_in: number
}

export class AuthError extends Error {
	constructor(
		message: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'TENANT_CONTEXT_REQUIRED',
	) {
		super(message)
		this.name = 'AuthError'
	}
}

export function buildSessionFromClaims(claims: AuthClaims): Session {
	return {
		user: {
			userId: claims.sub,
			role: claims.role,
			tenantId: claims.tenantId,
		},
		claims,
	}
}

export function hasRole(user: UserContext, allowedRoles: Role[]) {
	return allowedRoles.includes(user.role)
}

export function assertRole(user: UserContext, allowedRoles: Role[]) {
	if (!hasRole(user, allowedRoles)) {
		throw new AuthError('FORBIDDEN')
	}
}

export function requireRole(session: Session, allowedRoles: Role[]) {
	assertRole(session.user, allowedRoles)
	return session
}

export function requireTenantContext(session: Session) {
	if (!session.user.tenantId) {
		throw new AuthError('TENANT_CONTEXT_REQUIRED')
	}
	return session
}

export function isAuthError(error: unknown): error is AuthError {
	return error instanceof AuthError
}

function toRole(payload: CognitoPayload): Role {
	if (payload['custom:role'] === 'platform_admin') return 'platform_admin'
	if (payload['custom:role'] === 'tenant_user') return 'tenant_user'
	if (payload['custom:role'] === 'tenant_admin') return 'tenant_admin'

	if (payload['cognito:groups']?.includes('platform_admin')) {
		return 'platform_admin'
	}
	if (payload['cognito:groups']?.includes('tenant_user')) return 'tenant_user'
	return 'tenant_admin'
}

export async function verifyCognitoTokenAndBuildSession({
	token,
	userPoolId,
	clientId,
}: VerifyCognitoTokenInput): Promise<Session> {
	const verifier = CognitoJwtVerifier.create({
		userPoolId,
		tokenUse: 'id',
		clientId,
	})

	const payload = (await verifier.verify(token)) as CognitoPayload
	return buildSessionFromClaims({
		sub: payload.sub,
		role: toRole(payload),
		tenantId: payload['custom:tenant_id'],
		email: payload.email,
	})
}

export function createOauthState() {
	return randomBytes(24).toString('base64url')
}

export function createPkceVerifier() {
	return randomBytes(32).toString('base64url')
}

export function toPkceChallenge(verifier: string) {
	return createHash('sha256').update(verifier).digest('base64url')
}

export function buildHostedUiAuthorizeUrl({
	domain,
	clientId,
	redirectUri,
	state,
	codeChallenge,
	provider,
}: BuildHostedUiAuthorizeUrlInput) {
	const url = new URL(`https://${domain}/oauth2/authorize`)
	url.searchParams.set('client_id', clientId)
	url.searchParams.set('response_type', 'code')
	url.searchParams.set('scope', 'openid email profile')
	url.searchParams.set('redirect_uri', redirectUri)
	url.searchParams.set('state', state)
	url.searchParams.set('code_challenge_method', 'S256')
	url.searchParams.set('code_challenge', codeChallenge)

	if (provider) {
		url.searchParams.set('identity_provider', provider)
	}

	return url.toString()
}

export async function exchangeCodeForTokens({
	domain,
	clientId,
	redirectUri,
	code,
	codeVerifier,
}: ExchangeCodeForTokensInput): Promise<CognitoTokenResponse> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		client_id: clientId,
		code,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier,
	})

	const response = await fetch(`https://${domain}/oauth2/token`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	})

	if (!response.ok) {
		throw new AuthError('UNAUTHENTICATED')
	}

	return (await response.json()) as CognitoTokenResponse
}
