import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
} from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})

/**
 * DocumentClient wraps the raw DynamoDB client and automatically marshals/
 * unmarshals JS objects to/from DynamoDB AttributeValue format.
 */
export const docClient = DynamoDBDocumentClient.from(client)

const TABLE_NAME = process.env.SOCIAL_CRM_TABLE_NAME
if (!TABLE_NAME) {
	throw new Error('SOCIAL_CRM_TABLE_NAME environment variable is not set')
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type Channel = 'instagram' | 'facebook' | 'whatsapp'

/**
 * Tenant — represents a business account that has connected a platform account.
 * One Tenant record per connected channel account (e.g. one IG page, one TikTok
 * account). A future "Organization" entity can group multiple Tenants.
 *
 * pk = TENANT#<tenantId>
 * sk = METADATA
 */
export interface Tenant {
	pk: string
	sk: 'METADATA'
	tenantId: string
	/**
	 * Platform-specific account ID used to route inbound messages to this tenant.
	 * Examples: Instagram/Facebook Page ID, WABA_ID, TikTok user ID, LinkedIn org ID.
	 * GSI key for ByPlatformAccountId.
	 */
	platformAccountId: string
	channel: Channel
	name: string
	plan: string
	/** OAuth access token for the connected platform account. */
	accessToken: string
}

/**
 * Contact — a person who DMed the tenant's business account.
 *
 * pk = TENANT#<tenantId>
 * sk = CONTACT#<senderId>
 */
export interface Contact {
	pk: string
	sk: string
	tenantId: string
	/** PSID for Instagram/Facebook, phone number for WhatsApp. */
	senderId: string
	lastChannel: Channel
	/** Optional — populated when profile data is available. */
	name?: string
}

/**
 * Message — a single inbound message from a contact.
 *
 * pk = TENANT#<tenantId>#CONTACT#<senderId>
 * sk = MSG#<isoTimestamp>  (ISO-8601, lexicographically sortable)
 */
export interface Message {
	pk: string
	sk: string
	tenantId: string
	senderId: string
	body: string
	channel: Channel
	status: 'received'
	/** Original platform message ID — retained for deduplication. */
	externalMessageId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Access pattern: resolve a Tenant by the platform account that received the
 * inbound message. Queries the ByPlatformAccountId GSI (pk = platformAccountId).
 *
 * Returns undefined when no tenant has registered that account ID.
 */
export async function getTenantByPlatformAccountId(
	platformAccountId: string,
): Promise<Tenant | undefined> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: TABLE_NAME,
			IndexName: 'ByPlatformAccountId',
			KeyConditionExpression: 'platformAccountId = :v',
			ExpressionAttributeValues: { ':v': platformAccountId },
			Limit: 1,
		}),
	)
	return result.Items?.[0] as Tenant | undefined
}

/**
 * Access pattern: upsert a Contact within a Tenant's partition.
 * GetItem pk=TENANT#<tenantId> sk=CONTACT#<senderId> — if missing, PutItem.
 *
 * A conditional write (attribute_not_exists) guards against concurrent Lambda
 * executions both trying to create the same contact simultaneously.
 */
export async function getOrCreateContact(
	tenantId: string,
	senderId: string,
	channel: Channel,
): Promise<Contact> {
	const pk = `TENANT#${tenantId}`
	const sk = `CONTACT#${senderId}`

	const existing = await docClient.send(
		new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk } }),
	)
	if (existing.Item) return existing.Item as Contact

	const contact: Contact = { pk, sk, tenantId, senderId, lastChannel: channel }

	try {
		await docClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: contact,
				// Prevents a race-condition overwrite when two Lambdas process
				// the first message from the same sender at the same time
				ConditionExpression: 'attribute_not_exists(pk)',
			}),
		)
	} catch (err: unknown) {
		// Another concurrent invocation created the contact first — safe to ignore
		if (
			err &&
			typeof err === 'object' &&
			'name' in err &&
			err.name === 'ConditionalCheckFailedException'
		) {
			return contact
		}
		throw err
	}

	return contact
}

/**
 * Access pattern: append an inbound message for a contact.
 * PutItem pk=TENANT#<tenantId>#CONTACT#<senderId> sk=MSG#<isoTimestamp>.
 *
 * The ISO-8601 timestamp SK keeps messages in chronological order within the
 * contact's partition, enabling efficient range queries later.
 */
export async function saveMessage(
	tenantId: string,
	senderId: string,
	payload: {
		body: string
		channel: Channel
		externalMessageId: string
		/** Unix epoch in seconds as provided by the platform. */
		timestamp: number
	},
): Promise<Message> {
	const pk = `TENANT#${tenantId}#CONTACT#${senderId}`
	const sk = `MSG#${new Date(payload.timestamp * 1000).toISOString()}`

	const message: Message = {
		pk,
		sk,
		tenantId,
		senderId,
		body: payload.body,
		channel: payload.channel,
		status: 'received',
		externalMessageId: payload.externalMessageId,
	}

	await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: message }))

	return message
}

/**
 * Access pattern: write a Tenant record directly.
 * Used by the seed script to insert test tenant data.
 *
 * PutItem pk=TENANT#<tenantId> sk=METADATA.
 */
export async function putTenant(
	tenant: Omit<Tenant, 'pk' | 'sk'>,
): Promise<Tenant> {
	const pk = `TENANT#${tenant.tenantId}`
	const sk = 'METADATA' as const
	const item: Tenant = { pk, sk, ...tenant }
	await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }))
	return item
}
