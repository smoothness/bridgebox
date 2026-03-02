import { createHmac, randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { putAccount, putTenant } from '../packages/core/src/dynamo.ts'

const tableName = process.env.SOCIAL_CRM_TABLE_NAME
const apiEndpoint = process.env.API_ENDPOINT
const appSecret = process.env.META_APP_SECRET
const sendMessageApiKey = process.env.SEND_MESSAGE_API_KEY

if (!tableName) throw new Error('SOCIAL_CRM_TABLE_NAME is required')
if (!apiEndpoint) throw new Error('API_ENDPOINT is required')
if (!appSecret) throw new Error('META_APP_SECRET is required')
const appSecretValue = appSecret

const runId = Date.now().toString()


async function postSendMessage(
	body: unknown,
	apiKey?: string,
): Promise<{ status: number; json: unknown }> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
	}
	if (apiKey) headers['x-api-key'] = apiKey

	const res = await fetch(`${apiEndpoint}/send-message`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	})

	const json = (await res.json().catch(() => ({}))) as unknown
	return { status: res.status, json }
}

const accountMode = {
	tenantId: 'e2e-tenant-account-001',
	accountId: 'acct_e2e_001',
	platformAccountId: `PAGE_E2E_ACCOUNT_${runId}`,
	senderId: 'SENDER_E2E_ACCOUNT_001',
	mid: `m_e2e_account_${runId}`,
}

function sign(body: string): string {
	return `sha256=${createHmac('sha256', appSecretValue).update(body).digest('hex')}`
}

async function postWebhook(payload: unknown, signature: string): Promise<number> {
	const res = await fetch(`${apiEndpoint}/webhooks/meta`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-hub-signature-256': signature,
		},
		body: JSON.stringify(payload),
	})
	return res.status
}

async function countByPk(pk: string): Promise<number> {
	const raw = execSync(
		`aws dynamodb query --profile bridgebox-dev --region us-east-2 --table-name ${tableName} --key-condition-expression "pk = :pk" --expression-attribute-values '{":pk":{"S":"${pk}"}}' --output json`,
		{ encoding: 'utf8' },
	)
	const out = JSON.parse(raw) as { Count?: number }
	return out.Count ?? 0
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForMinCount(
	pk: string,
	minCount: number,
	timeoutMs = 30_000,
): Promise<number> {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		const count = await countByPk(pk)
		if (count >= minCount) return count
		await sleep(1000)
	}
	return countByPk(pk)
}

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(`E2E assertion failed: ${msg}`)
}

async function seed() {

	await putTenant({
		tenantId: accountMode.tenantId,
		platformAccountId: accountMode.platformAccountId,
		channel: 'instagram',
		name: 'E2E Tenant Account',
		plan: 'starter',
		accessToken: `tok_${randomUUID()}`,
	})

	await putAccount({
		tenantId: accountMode.tenantId,
		accountId: accountMode.accountId,
		platformAccountId: accountMode.platformAccountId,
		channel: 'instagram',
		displayName: 'E2E Account',
		accessToken: `tok_${randomUUID()}`,
		clientLabel: 'E2E Client',
	})
}

async function run() {
	console.log('Seeding e2e test records...')
	await seed()


	const validAccountPayload = {
		object: 'instagram',
		entry: [
			{
				id: accountMode.platformAccountId,
				messaging: [
					{
						sender: { id: accountMode.senderId },
						timestamp: 1740863234000,
						message: { mid: accountMode.mid, text: 'hello account mode' },
					},
				],
			},
		],
	}

	const unknownPayload = {
		object: 'instagram',
		entry: [
			{
				id: 'PAGE_E2E_UNKNOWN_001',
				messaging: [
					{
						sender: { id: 'SENDER_UNKNOWN' },
						timestamp: 1740863333000,
						message: { mid: 'm_unknown', text: 'should skip' },
					},
				],
			},
		],
	}

	console.log('Testing invalid signature -> 401...')
	const badSigStatus = await postWebhook(validAccountPayload, 'sha256=bad')
	assert(badSigStatus === 401, `expected 401, got ${badSigStatus}`)

	console.log('Testing send-message auth behavior...')
	if (sendMessageApiKey) {
		const unauthorized = await postSendMessage({}, 'wrong-key')
		assert(
			unauthorized.status === 401,
			`expected 401 for wrong x-api-key, got ${unauthorized.status}`,
		)
	}
	const invalidPayload = await postSendMessage(
		{},
		sendMessageApiKey || undefined,
	)
	assert(
		invalidPayload.status === 400,
		`expected 400 for invalid send-message payload, got ${invalidPayload.status}`,
	)


	console.log('Testing valid account webhook -> 200...')
	const accountStatus = await postWebhook(
		validAccountPayload,
		sign(JSON.stringify(validAccountPayload)),
	)
	assert(accountStatus === 200, `expected 200, got ${accountStatus}`)

	console.log('Testing unknown platformAccountId -> 200 (skip downstream)...')
	const unknownStatus = await postWebhook(
		unknownPayload,
		sign(JSON.stringify(unknownPayload)),
	)
	assert(unknownStatus === 200, `expected 200, got ${unknownStatus}`)

	console.log('Testing duplicate externalMessageId -> no duplicate write...')
	const accountPk = `TENANT#${accountMode.tenantId}#ACCOUNT#${accountMode.accountId}#CONTACT#${accountMode.senderId}`
	// Ensure first account webhook has been processed before duplicate assertion.
	const beforeDup = await waitForMinCount(accountPk, 2)
	const dupStatus = await postWebhook(
		validAccountPayload,
		sign(JSON.stringify(validAccountPayload)),
	)
	assert(dupStatus === 200, `expected 200, got ${dupStatus}`)
	const afterDup = await waitForMinCount(accountPk, beforeDup)
	assert(beforeDup === afterDup, `duplicate changed item count ${beforeDup} -> ${afterDup}`)

	console.log('Verifying persisted writes...')
	assert(
		(await waitForMinCount(accountPk, 2)) > 0,
		'account-mode message/contact not found',
	)

	console.log('✅ E2E webhook suite passed')
	console.log('Run cleanup: pnpm e2e:webhook:clean')
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})

