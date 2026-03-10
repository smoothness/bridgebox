import { NextResponse } from 'next/server'
function resolvePublicOrigin(request: Request) {
	const referer = request.headers.get('referer')
	if (referer) return new URL(referer).origin
	const origin = request.headers.get('origin')
	if (origin) return origin
	return new URL(request.url).origin
}

function buildLogoutUrl(request: Request) {
	const domain = process.env.COGNITO_DOMAIN
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const appBaseUrl = resolvePublicOrigin(request)
	if (!domain || !clientId) {
		return new URL('/login', request.url)
	}

	const url = new URL(`https://${domain}/logout`)
	url.searchParams.set('client_id', clientId)
	url.searchParams.set('logout_uri', `${appBaseUrl}/`)
	return url
}

function clearAuthCookies(response: NextResponse) {
	response.cookies.delete('bb_id_token')
	response.cookies.delete('bb_access_token')
	response.cookies.delete('bb_oauth_state')
	response.cookies.delete('bb_pkce_verifier')
}

export async function GET(request: Request) {
	const response = NextResponse.redirect(buildLogoutUrl(request), 303)
	clearAuthCookies(response)
	return response
}

export async function POST(request: Request) {
	return GET(request)
}
