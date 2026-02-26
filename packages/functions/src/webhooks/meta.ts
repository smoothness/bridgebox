import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyHandlerV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { z } from 'zod'

/**
 * Zod schema for Meta's webhook verification GET request query parameters.
 * Meta sends hub.mode=subscribe, hub.verify_token, and hub.challenge.
 */
const VerifyChallengeSchema = z.object({
	'hub.mode': z.literal('subscribe'),
	'hub.verify_token': z.string().min(1),
	'hub.challenge': z.string().min(1),
})

export const handler: APIGatewayProxyHandlerV2 = async (
	event: APIGatewayProxyEventV2,
) => {
	const method = event.requestContext.http.method

	if (method === 'GET') {
		return handleVerifyChallenge(event)
	}

	return {
		statusCode: 200,
		body: 'Hello world',
	}
}

/**
 * Handles Meta's webhook verification challenge (GET).
 * Ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
function handleVerifyChallenge(
	event: APIGatewayProxyEventV2,
): APIGatewayProxyResultV2 {
	const parseResult = VerifyChallengeSchema.safeParse(
		event.queryStringParameters ?? {},
	)

	if (!parseResult.success) {
		return {
			statusCode: 403,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				message: 'Forbidden: invalid verification parameters',
			}),
		}
	}

	const { 'hub.verify_token': verifyToken, 'hub.challenge': challenge } =
		parseResult.data
	const configuredToken = process.env.WEBHOOK_VERIFY_TOKEN

	if (!configuredToken || verifyToken !== configuredToken) {
		return {
			statusCode: 403,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'Forbidden: token mismatch' }),
		}
	}

	return {
		statusCode: 200,
		body: challenge,
	}
}
