import { NextResponse } from 'next/server'

function cognitoRegionFromUserPoolId(userPoolId?: string) {
	if (!userPoolId) return process.env.AWS_REGION ?? 'us-east-2'
	return userPoolId.split('_')[0] ?? process.env.AWS_REGION ?? 'us-east-2'
}

export async function POST(request: Request) {
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const userPoolId = process.env.COGNITO_USER_POOL_ID
	if (!clientId) {
		return NextResponse.json({ error: 'Missing COGNITO_APP_CLIENT_ID' }, { status: 500 })
	}

	const formData = await request.formData()
	const email = String(formData.get('email') ?? '').trim().toLowerCase()
	const code = String(formData.get('code') ?? '').trim()
	if (!email || !code) {
		const failUrl = new URL('/confirm-signup', request.url)
		failUrl.searchParams.set('email', email)
		failUrl.searchParams.set('error', 'confirm_failed')
		return NextResponse.redirect(failUrl)
	}

	const region = cognitoRegionFromUserPoolId(userPoolId)
	const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-amz-json-1.1',
			'x-amz-target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
		},
		body: JSON.stringify({
			ClientId: clientId,
			Username: email,
			ConfirmationCode: code,
		}),
	})

	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => ({}))) as {
			__type?: string
		}
		const errorType = errorPayload.__type ?? ''
		if (errorType.includes('NotAuthorizedException')) {
			return NextResponse.redirect(new URL('/login?confirmed=1', request.url))
		}
		const failUrl = new URL('/confirm-signup', request.url)
		failUrl.searchParams.set('email', email)
		failUrl.searchParams.set('error', 'confirm_failed')
		return NextResponse.redirect(failUrl)
	}

	return NextResponse.redirect(new URL('/login?confirmed=1', request.url))
}
