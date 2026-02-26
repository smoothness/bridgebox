import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Validates the x-hub-signature-256 header sent by Meta on every webhook POST.
 *
 * Meta computes: sha256=HMAC-SHA256(rawBody, APP_SECRET)
 * We recompute the same hash and compare using a timing-safe equality check
 * to prevent timing-based side-channel attacks.
 *
 * Ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
 */
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
