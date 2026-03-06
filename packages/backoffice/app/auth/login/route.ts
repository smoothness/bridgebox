import {
	buildHostedUiAuthorizeUrl,
	createOauthState,
	createPkceVerifier,
	toPkceChallenge,
	type SocialProvider,
} from '@bridgebox/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ONE_TIME_COOKIE_MAX_AGE_SECONDS = 60 * 10
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8

function cognitoRegionFromUserPoolId(userPoolId?: string) {
	if (!userPoolId) return process.env.AWS_REGION ?? 'us-east-2'
	return userPoolId.split('_')[0] ?? process.env.AWS_REGION ?? 'us-east-2'
}

export async function GET(request: Request) {
	const url = new URL(request.url)
	const providerParam = url.searchParams.get('provider')
	const provider =
		providerParam === 'Google' || providerParam === 'Facebook'
			? (providerParam as SocialProvider)
			: undefined

	const domain = process.env.COGNITO_DOMAIN
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const appBaseUrl = process.env.BACKOFFICE_BASE_URL ?? 'http://localhost:3001'
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

export async function POST(request: Request) {
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const userPoolId = process.env.COGNITO_USER_POOL_ID
	if (!clientId || !userPoolId) {
		return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
	}

	const formData = await request.formData()
	const email = String(formData.get('email') ?? '').trim().toLowerCase()
	const password = String(formData.get('password') ?? '')
	if (!email || !password) {
		return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
	}

	const region = cognitoRegionFromUserPoolId(userPoolId)
	const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-amz-json-1.1',
			'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth',
		},
		body: JSON.stringify({
			AuthFlow: 'USER_PASSWORD_AUTH',
			ClientId: clientId,
			AuthParameters: {
				USERNAME: email,
				PASSWORD: password,
			},
		}),
	})

	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => ({}))) as {
			__type?: string
		}
		const errorType = errorPayload.__type ?? ''
		if (
			errorType.includes('NotAuthorizedException') ||
			errorType.includes('UserNotFoundException')
		) {
			return NextResponse.redirect(new URL('/login?error=invalid_credentials', request.url))
		}
		if (errorType.includes('UserNotConfirmedException')) {
			const confirmUrl = new URL('/confirm-signup', request.url)
			confirmUrl.searchParams.set('email', email)
			confirmUrl.searchParams.set('error', 'confirm_required')
			return NextResponse.redirect(confirmUrl)
		}
		return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
	}

	const payload = (await response.json()) as {
		AuthenticationResult?: {
			IdToken?: string
			AccessToken?: string
		}
	}
	const idToken = payload.AuthenticationResult?.IdToken
	const accessToken = payload.AuthenticationResult?.AccessToken
	if (!idToken || !accessToken) {
		return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
	}

	const redirectResponse = NextResponse.redirect(new URL('/', request.url))
	redirectResponse.cookies.set('bb_id_token', idToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax',
		path: '/',
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
	})
	redirectResponse.cookies.set('bb_access_token', accessToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax',
		path: '/',
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
	})

	return redirectResponse
}
