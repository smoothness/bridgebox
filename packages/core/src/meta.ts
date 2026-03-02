import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Validates the x-hub-signature-256 header sent by Meta on every webhook POST.
 *
 * Meta computes: sha256=HMAC-SHA256(rawBody, APP_SECRET)
 * We recompute the same hash and compare using a timing-safe equality check
 * to prevent timing-based side-channel attacks.
 *
 * Ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
 */
// ─── Instagram / Facebook Webhook Payload ───────────────────────────────────

/**
 * Zod schema for Instagram and Facebook webhook message payloads.
 *
 * Both channels share the same payload shape — only the `object` field differs:
 *   - Instagram → object = "instagram"
 *   - Facebook  → object = "page"
 *
 * The `messaging` array may contain various event types (messages, reads,
 * deliveries). Fields that are not present in every event type are marked
 * optional so unrecognised event types pass validation and can be skipped
 * gracefully by the processor.
 *
 * Ref: https://developers.facebook.com/docs/messenger-platform/webhooks
 */
export const MetaSocialWebhookSchema = z.object({
	object: z.enum(['instagram', 'page']),
	entry: z
		.array(
			z
				.object({
					// Instagram/Facebook Page ID — maps to a Tenant via platformAccountId
					id: z.string(),
					messaging: z
						.array(
							z
								.object({
									sender: z.object({ id: z.string() }),
									timestamp: z.number(),
									// Present on message events; absent on read/delivery events
									message: z
										.object({
											mid: z.string(),
											// Absent for attachments, stickers, etc.
											text: z.string().optional(),
										})
										.optional(),
								})
								.passthrough(),
						)
						// Default to [] so entries without a messaging field (e.g. comment events)
						// still pass validation and are skipped in the processor
						.default([]),
				})
				.passthrough(),
		)
		.min(1),
})

export type MetaSocialWebhook = z.infer<typeof MetaSocialWebhookSchema>
// ─── Outbound Messaging (Instagram/Facebook/WhatsApp) ───────────────────────

export const OutboundChannelSchema = z.enum(['instagram', 'facebook', 'whatsapp'])
export type OutboundChannel = z.infer<typeof OutboundChannelSchema>

const MetaSendMessageResponseSchema = z.object({
	recipient_id: z.string().optional(),
	message_id: z.string().optional(),
	messages: z.array(z.object({ id: z.string() })).optional(),
})

export type MetaSendMessageResponse = z.infer<typeof MetaSendMessageResponseSchema>

/**
 * Sends a plain text message through Meta Graph API.
 *
 * Channel specifics:
 * - instagram/facebook: /{PAGE_ID}/messages
 * - whatsapp:          /{PHONE_NUMBER_ID}/messages
 */
export async function sendMetaTextMessage(input: {
	channel: OutboundChannel
	/** Page ID (IG/FB) or Phone Number ID (WhatsApp). */
	platformAccountId: string
	/** PSID / IG scoped user ID / WhatsApp recipient phone number. */
	recipientId: string
	text: string
	accessToken: string
}): Promise<MetaSendMessageResponse> {
	const { channel, platformAccountId, recipientId, text, accessToken } = input
	const graphVersion = process.env.META_GRAPH_VERSION ?? 'v20.0'
	const url = `https://graph.facebook.com/${graphVersion}/${platformAccountId}/messages`

	const payload =
		channel === 'whatsapp'
			? {
					messaging_product: 'whatsapp',
					to: recipientId,
					type: 'text',
					text: { body: text },
				}
			: {
					recipient: { id: recipientId },
					message: { text },
					messaging_type: 'RESPONSE',
				}

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errorText = await response.text()
		throw new Error(
			`Meta send message failed (${response.status}) [${channel}]: ${errorText}`,
		)
	}

	const data = await response.json()
	const parsed = MetaSendMessageResponseSchema.safeParse(data)
	if (!parsed.success) {
		throw new Error(
			`Meta send message returned unexpected payload: ${JSON.stringify(data)}`,
		)
	}

	return parsed.data
}

// ─── Signature Validation ─────────────────────────────────────────────────────
export function isValidMetaSignature(
	rawBody: string,
	signatureHeader: string,
	appSecret: string,
): boolean {
	if (!signatureHeader.startsWith('sha256=')) return false

	const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`

	try {
		return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
	} catch {
		// Buffers of different lengths throw — treat as invalid
		return false
	}
}
