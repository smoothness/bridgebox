import {
	getOrCreateAccountContact,
	getRoutingContextByPlatformAccountId,
	saveAccountMessage,
} from '@bridgebox/core/dynamo'
import { MetaSocialWebhookSchema } from '@bridgebox/core/meta'
import type { SQSBatchResponse, SQSHandler } from 'aws-lambda'

/**
 * Processes batches of webhook payloads from IncomingMessagesQueue.
 *
 * For each SQS record:
 *   1. Parse the body against the shared Instagram/Facebook Zod schema.
 *      Non-messaging events (reads, deliveries, comments) pass validation but
 *      have no `message` field — they are skipped without failure.
 *   2. Resolve the Tenant by the platform account ID (entry[0].id). If no
 *      tenant is registered for that account, the record is skipped (not
 *      retried — retrying a payload without a tenant will never succeed).
 *   3. Upsert the Contact and persist the Message to DynamoDB.
 *
 * Only records that fail due to transient errors (e.g. DynamoDB timeouts) are
 * added to batchItemFailures so SQS retries just those records, not the whole
 * batch.
 */
export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
	const batchItemFailures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		try {
			// ── 1. Parse payload ──────────────────────────────────────────────
			let body: unknown
			try {
				body = JSON.parse(record.body)
			} catch {
				console.warn('Skipping record with non-JSON body', record.messageId)
				continue
			}

			const parsed = MetaSocialWebhookSchema.safeParse(body)
			if (!parsed.success) {
				// Payload doesn't match instagram/page schema (e.g. WhatsApp, ad events).
				// Schema failures are permanent — retrying won't change the payload.
				console.warn(
					'Skipping unrecognised webhook payload',
					record.messageId,
					parsed.error.flatten(),
				)
				continue
			}

			const { object, entry } = parsed.data
			const channel = object === 'instagram' ? 'instagram' : 'facebook'

			// ── 2. Resolve tenant ─────────────────────────────────────────────
			// entry[0].id is the Instagram/Facebook Page ID that received the DM
			const platformAccountId = entry[0].id
			const routing = await getRoutingContextByPlatformAccountId(platformAccountId)

			if (!routing) {
				// No tenant has registered this platform account. Skip — not retryable.
				console.warn(
					`No tenant found for platformAccountId=${platformAccountId}. Skipping record ${record.messageId}.`,
				)
				continue
			}

			// ── 3. Persist contact + message(s) ──────────────────────────────
			for (const e of entry) {
				for (const msg of e.messaging) {
					if (!msg.message?.text) {
						// Non-text events: read receipts, delivery confirmations, stickers, etc.
						console.info(
							`Skipping non-text messaging event for sender=${msg.sender.id}`,
						)
						continue
					}

					await getOrCreateAccountContact(
						routing.tenantId,
						routing.accountId,
						msg.sender.id,
						channel,
					)
					await saveAccountMessage(
						routing.tenantId,
						routing.accountId,
						msg.sender.id,
						{
							body: msg.message.text,
							channel,
							externalMessageId: msg.message.mid,
							timestamp: msg.timestamp,
						},
					)
					console.info(
						`Saved message mid=${msg.message.mid} sender=${msg.sender.id} tenant=${routing.tenantId} account=${routing.accountId} mode=${routing.mode} channel=${channel}`,
					)
				}
			}
		} catch (err) {
			// Transient error (DynamoDB timeout, SDK error, etc.) — mark for retry
			console.error(`Failed to process SQS record ${record.messageId}`, err)
			batchItemFailures.push({ itemIdentifier: record.messageId })
		}
	}

	return { batchItemFailures }
}
