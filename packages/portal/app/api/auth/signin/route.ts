import { NextResponse } from 'next/server'
function cognitoRegionFromUserPoolId(userPoolId: string) {
	return userPoolId.split('_')[0] ?? 'us-east-2'
}

export async function GET(request: Request) {
	return NextResponse.redirect(new URL('/signin', request.url))
}
export async function POST(request: Request) {
	const clientId = process.env.COGNITO_APP_CLIENT_ID
	const userPoolId = process.env.COGNITO_USER_POOL_ID
	if (!clientId || !userPoolId) {
		return NextResponse.json(
			{ error: 'Missing COGNITO_APP_CLIENT_ID or COGNITO_USER_POOL_ID' },
			{ status: 500 },
		)
	}

	const formData = await request.formData()
	const fullName = String(formData.get('fullName') ?? '').trim()
	const email = String(formData.get('email') ?? '').trim().toLowerCase()
	const password = String(formData.get('password') ?? '')
	if (!email || !password) {
		return NextResponse.redirect(new URL('/signin?error=missing_fields', request.url))
	}

	const region = cognitoRegionFromUserPoolId(userPoolId)
	const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-amz-json-1.1',
			'x-amz-target': 'AWSCognitoIdentityProviderService.SignUp',
		},
		body: JSON.stringify({
			ClientId: clientId,
			Username: email,
			Password: password,
			UserAttributes: [
				{ Name: 'email', Value: email },
				...(fullName ? [{ Name: 'name', Value: fullName }] : []),
			],
		}),
	})

	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => ({}))) as {
			__type?: string
			message?: string
		}
		const errorType = errorPayload.__type ?? ''
		if (errorType.includes('UsernameExistsException')) {
			const confirmUrl = new URL('/confirm-signup', request.url)
			confirmUrl.searchParams.set('email', email)
			return NextResponse.redirect(confirmUrl)
		}
		if (errorType.includes('InvalidPasswordException')) {
			return NextResponse.redirect(new URL('/signin?error=weak_password', request.url))
		}
		return NextResponse.redirect(new URL('/signin?error=signup_failed', request.url))
	}
	const confirmUrl = new URL('/confirm-signup', request.url)
	confirmUrl.searchParams.set('email', email)
	return NextResponse.redirect(confirmUrl)
}
