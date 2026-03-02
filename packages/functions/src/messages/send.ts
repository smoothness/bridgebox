import {
	getAccountByPlatformAccountId,
	getTenantByPlatformAccountId,
} from '@bridgebox/core/dynamo'
import { OutboundChannelSchema, sendMetaTextMessage } from '@bridgebox/core/meta'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyHandlerV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { z } from 'zod'

const SendMessageSchema = z.object({
	channel: OutboundChannelSchema,
	platformAccountId: z.string().min(1),
	recipientId: z.string().min(1),
	text: z.string().min(1).max(4000),
})

export const handler: APIGatewayProxyHandlerV2 = async (
	event: APIGatewayProxyEventV2,
) => {
	if (event.requestContext.http.method !== 'POST') {
		return json(405, { message: 'Method not allowed' })
	}

	const parsedBody = safeJsonParse(event.body ?? '')
	if (!parsedBody.ok) {
		return json(400, { message: 'Invalid JSON body' })
	}

	const parsed = SendMessageSchema.safeParse(parsedBody.value)
	if (!parsed.success) {
		return json(400, {
			message: 'Invalid request payload',
			errors: parsed.error.flatten(),
		})
	}

	const { channel, platformAccountId, recipientId, text } = parsed.data

	// Account-first evolution path with tenant metadata fallback.
	const account = await getAccountByPlatformAccountId(platformAccountId)
	const tenant = account
		? undefined
		: await getTenantByPlatformAccountId(platformAccountId)

	if (!account && !tenant) {
		return json(404, {
			message: 'No tenant/account found for provided platformAccountId',
		})
	}

	const accessToken = account?.accessToken ?? tenant?.accessToken
	if (!accessToken) {
		return json(400, {
			message: 'Missing access token for resolved tenant/account',
		})
	}

	try {
		const result = await sendMetaTextMessage({
			channel,
			platformAccountId,
			recipientId,
			text,
			accessToken,
		})

		return json(200, {
			message: 'Message sent',
			result,
		})
	} catch (err) {
		console.error('send-message failed', err)
		return json(502, {
			message: 'Failed to send message through Meta API',
		})
	}
}

function safeJsonParse(raw: string):
	| { ok: true; value: unknown }
	| { ok: false } {
	try {
		return { ok: true, value: JSON.parse(raw) }
	} catch {
		return { ok: false }
	}
}

function json(statusCode: number, payload: unknown): APIGatewayProxyResultV2 {
	return {
		statusCode,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	}
}

