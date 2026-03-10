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
	if (!email) {
		return NextResponse.redirect(new URL('/confirm-signup?error=confirm_failed', request.url))
	}

	const region = cognitoRegionFromUserPoolId(userPoolId)
	const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-amz-json-1.1',
			'x-amz-target': 'AWSCognitoIdentityProviderService.ResendConfirmationCode',
		},
		body: JSON.stringify({
			ClientId: clientId,
			Username: email,
		}),
	})

	const nextUrl = new URL('/confirm-signup', request.url)
	nextUrl.searchParams.set('email', email)
	if (response.ok) {
		nextUrl.searchParams.set('resent', '1')
		return NextResponse.redirect(nextUrl)
	}
	nextUrl.searchParams.set('error', 'confirm_failed')
	return NextResponse.redirect(nextUrl)
}
