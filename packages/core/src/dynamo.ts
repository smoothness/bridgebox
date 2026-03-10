import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})

/**
 * DocumentClient wraps the raw DynamoDB client and automatically marshals/
 * unmarshals JS objects to/from DynamoDB AttributeValue format.
 */
export const docClient = DynamoDBDocumentClient.from(client)

function getTableName() {
	const tableName = process.env.SOCIAL_CRM_TABLE_NAME
	if (!tableName) {
		throw new Error('SOCIAL_CRM_TABLE_NAME environment variable is not set')
	}
	return tableName
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type Channel = 'instagram' | 'facebook' | 'whatsapp'
export type AppTarget = 'portal' | 'backoffice'
export type MembershipRole = 'tenant_user' | 'tenant_admin' | 'platform_admin'

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
 * Account — social/business account managed by a Tenant (agency model).
 *
 * pk = TENANT#<tenantId>
 * sk = ACCOUNT#<accountId>
 */
export interface Account {
	pk: string
	sk: string
	tenantId: string
	accountId: string
	platformAccountId: string
	channel: Channel
	displayName: string
	accessToken: string
	clientLabel?: string
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
export interface RoutingContext {
	tenantId: string
	accountId: string
	mode: 'account'
}

export interface Membership {
	pk: string
	sk: string
	principalId: string
	email: string
	app: AppTarget
	role: MembershipRole
	tenantId?: string
	createdAt: string
	updatedAt: string
	gsi1pk: string
	gsi1sk: string
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
			TableName: getTableName(),
			IndexName: 'ByPlatformAccountId',
			KeyConditionExpression: 'platformAccountId = :v',
			ExpressionAttributeValues: { ':v': platformAccountId },
			Limit: 1,
		}),
	)
	return result.Items?.[0] as Tenant | undefined
}

/**
 * Access pattern: resolve an Account by platform account ID via ByPlatformAccountId GSI.
 * Returns undefined when no Account exists for the given platform account.
 */
export async function getAccountByPlatformAccountId(
	platformAccountId: string,
): Promise<Account | undefined> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: getTableName(),
			IndexName: 'ByPlatformAccountId',
			KeyConditionExpression: 'platformAccountId = :v',
			ExpressionAttributeValues: { ':v': platformAccountId },
			Limit: 10,
		}),
	)

	const items = result.Items ?? []
	return items.find(
		(item) =>
			typeof item.pk === 'string' &&
			item.pk.startsWith('TENANT#') &&
			typeof item.sk === 'string' &&
			item.sk.startsWith('ACCOUNT#') &&
			typeof item.tenantId === 'string' &&
			typeof item.accountId === 'string',
	) as Account | undefined
}

/**
 * Access pattern: resolve routing context by platform account ID.
 */
export async function getRoutingContextByPlatformAccountId(
	platformAccountId: string,
): Promise<RoutingContext | undefined> {
	const account = await getAccountByPlatformAccountId(platformAccountId)

	if (account) {
		return {
			tenantId: account.tenantId,
			accountId: account.accountId,
			mode: 'account',
		}
	}

	return undefined
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
		new GetCommand({ TableName: getTableName(), Key: { pk, sk } }),
	)
	if (existing.Item) return existing.Item as Contact

	const contact: Contact = { pk, sk, tenantId, senderId, lastChannel: channel }

	try {
		await docClient.send(
			new PutCommand({
				TableName: getTableName(),
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
 * Access pattern: upsert a Contact within a Tenant+Account scope.
 * GetItem pk=TENANT#<tenantId>#ACCOUNT#<accountId> sk=CONTACT#<senderId> — if missing, PutItem.
 */
export async function getOrCreateAccountContact(
	tenantId: string,
	accountId: string,
	senderId: string,
	channel: Channel,
): Promise<Contact> {
	const pk = `TENANT#${tenantId}#ACCOUNT#${accountId}`
	const sk = `CONTACT#${senderId}`

	const existing = await docClient.send(
		new GetCommand({ TableName: getTableName(), Key: { pk, sk } }),
	)
	if (existing.Item) return existing.Item as Contact

	const contact: Contact = { pk, sk, tenantId, senderId, lastChannel: channel }

	try {
		await docClient.send(
			new PutCommand({
				TableName: getTableName(),
				Item: { ...contact, accountId },
				ConditionExpression: 'attribute_not_exists(pk)',
			}),
		)
	} catch (err: unknown) {
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
	const normalizedMs = normalizePlatformTimestampToMs(payload.timestamp)
	const safeMessageId = encodeURIComponent(payload.externalMessageId)
	// Collision-safe SK: keeps chronological ordering and disambiguates same-ms writes.
	const sk = `MSG#${new Date(normalizedMs).toISOString()}#${safeMessageId}`
	const dedupeSk = `MSGID#${safeMessageId}`

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

	try {
		await docClient.send(
			new TransactWriteCommand({
				TransactItems: [
					{
						// Idempotency marker: one record per externalMessageId per contact.
						Put: {
							TableName: getTableName(),
							Item: {
								pk,
								sk: dedupeSk,
								tenantId,
								senderId,
								externalMessageId: payload.externalMessageId,
								entityType: 'MessageDedup',
							},
							ConditionExpression: 'attribute_not_exists(sk)',
						},
					},
					{
						Put: {
							TableName: getTableName(),
							Item: message,
							ConditionExpression:
								'attribute_not_exists(pk) AND attribute_not_exists(sk)',
						},
					},
				],
			}),
		)
	} catch (err: unknown) {
		// Duplicate delivery: dedupe marker exists; treat as successful no-op.
		if (
			err &&
			typeof err === 'object' &&
			'name' in err &&
			err.name === 'TransactionCanceledException'
		) {
			return message
		}
		throw err
	}

	return message
}

/**
 * Access pattern: append inbound message for Tenant+Account+Contact scope.
 * PutItem pk=TENANT#<tenantId>#ACCOUNT#<accountId>#CONTACT#<senderId> sk=MSG#<iso>#<externalMessageId>.
 */
export async function saveAccountMessage(
	tenantId: string,
	accountId: string,
	senderId: string,
	payload: {
		body: string
		channel: Channel
		externalMessageId: string
		timestamp: number
	},
): Promise<Message> {
	const normalizedMs = normalizePlatformTimestampToMs(payload.timestamp)
	const safeMessageId = encodeURIComponent(payload.externalMessageId)
	const pk = `TENANT#${tenantId}#ACCOUNT#${accountId}#CONTACT#${senderId}`
	const sk = `MSG#${new Date(normalizedMs).toISOString()}#${safeMessageId}`
	const dedupeSk = `MSGID#${safeMessageId}`

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

	try {
		await docClient.send(
			new TransactWriteCommand({
				TransactItems: [
					{
						Put: {
							TableName: getTableName(),
							Item: {
								pk,
								sk: dedupeSk,
								tenantId,
								accountId,
								senderId,
								externalMessageId: payload.externalMessageId,
								entityType: 'MessageDedup',
							},
							ConditionExpression: 'attribute_not_exists(sk)',
						},
					},
					{
						Put: {
							TableName: getTableName(),
							Item: { ...message, accountId },
							ConditionExpression:
								'attribute_not_exists(pk) AND attribute_not_exists(sk)',
						},
					},
				],
			}),
		)
	} catch (err: unknown) {
		if (
			err &&
			typeof err === 'object' &&
			'name' in err &&
			err.name === 'TransactionCanceledException'
		) {
			return message
		}
		throw err
	}

	return message
}
/**
 * Normalizes platform timestamps to epoch milliseconds.
 *
 * Platforms may send either:
 * - seconds (eg 1740861234)
 * - milliseconds (eg 1740861234000)
 */
function normalizePlatformTimestampToMs(rawTimestamp: number): number {
	if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) {
		throw new Error(`Invalid platform timestamp: ${rawTimestamp}`)
	}
	return rawTimestamp < 1_000_000_000_000
		? Math.floor(rawTimestamp * 1000)
		: Math.floor(rawTimestamp)
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
	await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
	return item
}

/**
 * Access pattern: write an Account record directly.
 * Used by seed/testing scripts for agency model.
 *
 * PutItem pk=TENANT#<tenantId> sk=ACCOUNT#<accountId>.
 */
export async function putAccount(
	account: Omit<Account, 'pk' | 'sk'>,
): Promise<Account> {
	const pk = `TENANT#${account.tenantId}`
	const sk = `ACCOUNT#${account.accountId}`
	const item: Account = { pk, sk, ...account }
	await docClient.send(new PutCommand({ TableName: getTableName(), Item: item }))
	return item
}

function membershipPk(principalId: string) {
	return `USER#${principalId}`
}

function membershipSk(app: AppTarget) {
	return `MEMBERSHIP#${app}`
}

function membershipEmailPk(email: string) {
	return `EMAIL#${email.trim().toLowerCase()}`
}

function toMembershipRole(value?: string): MembershipRole | undefined {
	if (value === 'tenant_user') return 'tenant_user'
	if (value === 'tenant_admin') return 'tenant_admin'
	if (value === 'platform_admin') return 'platform_admin'
	return undefined
}

function toMembership(item: Record<string, unknown>): Membership | undefined {
	if (typeof item.pk !== 'string' || typeof item.sk !== 'string') return undefined
	if (typeof item.principalId !== 'string' || typeof item.email !== 'string') {
		return undefined
	}
	if (item.app !== 'portal' && item.app !== 'backoffice') return undefined
	const role = toMembershipRole(
		typeof item.role === 'string' ? item.role : undefined,
	)
	if (!role) return undefined
	if (typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string') {
		return undefined
	}

	return {
		pk: item.pk,
		sk: item.sk,
		principalId: item.principalId,
		email: item.email,
		app: item.app,
		role,
		tenantId: typeof item.tenantId === 'string' ? item.tenantId : undefined,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
		gsi1pk:
			typeof item.gsi1pk === 'string'
				? item.gsi1pk
				: membershipEmailPk(item.email),
		gsi1sk:
			typeof item.gsi1sk === 'string' ? item.gsi1sk : membershipSk(item.app),
	}
}

export async function getMembershipByPrincipalIdAndApp(
	principalId: string,
	app: AppTarget,
): Promise<Membership | undefined> {
	const result = await docClient.send(
		new GetCommand({
			TableName: getTableName(),
			Key: {
				pk: membershipPk(principalId),
				sk: membershipSk(app),
			},
		}),
	)
	if (!result.Item) return undefined
	return toMembership(result.Item as Record<string, unknown>)
}

export async function getMembershipByEmailAndApp(
	email: string,
	app: AppTarget,
): Promise<Membership | undefined> {
	const result = await docClient.send(
		new QueryCommand({
			TableName: getTableName(),
			IndexName: 'ByUserEmail',
			KeyConditionExpression: 'gsi1pk = :email AND gsi1sk = :membership',
			ExpressionAttributeValues: {
				':email': membershipEmailPk(email),
				':membership': membershipSk(app),
			},
			Limit: 1,
		}),
	)
	const item = result.Items?.[0] as Record<string, unknown> | undefined
	if (!item) return undefined
	return toMembership(item)
}

export async function putMembership(
	input: Omit<
		Membership,
		'pk' | 'sk' | 'createdAt' | 'updatedAt' | 'gsi1pk' | 'gsi1sk'
	>,
): Promise<Membership> {
	const now = new Date().toISOString()
	const normalizedEmail = input.email.trim().toLowerCase()
	const item: Membership = {
		pk: membershipPk(input.principalId),
		sk: membershipSk(input.app),
		principalId: input.principalId,
		email: normalizedEmail,
		app: input.app,
		role: input.role,
		tenantId: input.tenantId,
		createdAt: now,
		updatedAt: now,
		gsi1pk: membershipEmailPk(normalizedEmail),
		gsi1sk: membershipSk(input.app),
	}

	await docClient.send(
		new PutCommand({
			TableName: getTableName(),
			Item: item,
		}),
	)
	return item
}
