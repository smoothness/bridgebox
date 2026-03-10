import { exchangeCodeForTokens } from '@bridgebox/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8

export async function GET(request: Request) {
	const url = new URL(request.url)
	const code = url.searchParams.get('code')
	const state = url.searchParams.get('state')
	const cookieStore = await cookies()
	const expectedState = cookieStore.get('bb_oauth_state')?.value
	const codeVerifier = cookieStore.get('bb_pkce_verifier')?.value

	if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
		return NextResponse.redirect(new URL('/forbidden', request.url))
	}

	const domain = process.env.COGNITO_DOMAIN
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const appBaseUrl = process.env.PORTAL_BASE_URL ?? 'http://localhost:3000'
	const redirectUri = `${appBaseUrl}/api/auth/callback`

	if (!domain || !clientId) {
		return NextResponse.redirect(new URL('/forbidden', request.url))
	}

	const tokens = await exchangeCodeForTokens({
		domain,
		clientId,
		redirectUri,
		code,
		codeVerifier,
	})

	cookieStore.delete('bb_oauth_state')
	cookieStore.delete('bb_pkce_verifier')

	cookieStore.set('bb_id_token', tokens.id_token, {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax',
		path: '/',
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
	})
	cookieStore.set('bb_access_token', tokens.access_token, {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax',
		path: '/',
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
	})

	return NextResponse.redirect(new URL('/', request.url))
}
