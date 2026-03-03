import {
	buildHostedUiAuthorizeUrl,
	createOauthState,
	createPkceVerifier,
	type SocialProvider,
	toPkceChallenge,
} from '@bridgebox/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ONE_TIME_COOKIE_MAX_AGE_SECONDS = 60 * 10

export async function GET(request: Request) {
	const url = new URL(request.url)
	const providerParam = url.searchParams.get('provider')
	const provider =
		providerParam === 'Google' || providerParam === 'Facebook'
			? (providerParam as SocialProvider)
			: undefined

	const domain = process.env.COGNITO_DOMAIN
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const appBaseUrl = process.env.PORTAL_BASE_URL ?? 'http://localhost:3000'
	const redirectUri = `${appBaseUrl}/auth/callback`

	if (!domain || !clientId) {
		return NextResponse.json(
			{ error: 'Missing COGNITO_DOMAIN or COGNITO_APP_CLIENT_ID' },
			{ status: 500 },
		)
	}

	const state = createOauthState()
	const codeVerifier = createPkceVerifier()
	const codeChallenge = toPkceChallenge(codeVerifier)
	const authorizeUrl = buildHostedUiAuthorizeUrl({
		domain,
		clientId,
		redirectUri,
		state,
		codeChallenge,
		provider,
	})

	const cookieStore = await cookies()
	cookieStore.set('bb_oauth_state', state, {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax',
		path: '/',
		maxAge: ONE_TIME_COOKIE_MAX_AGE_SECONDS,
	})
	cookieStore.set('bb_pkce_verifier', codeVerifier, {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax',
		path: '/',
		maxAge: ONE_TIME_COOKIE_MAX_AGE_SECONDS,
	})

	return NextResponse.redirect(authorizeUrl)
}
