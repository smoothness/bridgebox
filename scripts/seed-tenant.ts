/**
 * Seed script — inserts test Tenant (and optional Account) records into SocialCRMTable.
 *
 * Run via:
 *   pnpm db:seed
 *
 * The script is executed with `sst bind` so SOCIAL_CRM_TABLE_NAME is
 * automatically injected from the deployed stack outputs.
 *
 * Configuration (override via environment variables):
 *
 *   SEED_PLATFORM_ACCOUNT_ID   The Instagram/Facebook Page ID registered in
 *                              your Meta developer app. Must match the page ID
 *                              that appears in webhook payloads (entry[0].id).
 *                              Default: "YOUR_PAGE_ID_HERE" (replace before use)
 *
 *   SEED_ACCESS_TOKEN          Page access token from the Meta developer portal.
 *                              Default: "YOUR_ACCESS_TOKEN_HERE"
 *
 *   SEED_CHANNEL               "instagram" | "facebook"
 *                              Default: "instagram"
 *
 *   SEED_TENANT_NAME           Display name for the tenant.
 *                              Default: "Test Tenant"
 *
 *   SEED_PLAN                  Billing plan identifier.
 *                              Default: "starter"
 *
 *   SEED_MODE                  "tenant" | "account"
 *                              - tenant: creates only Tenant (legacy flow)
 *                              - account: creates Tenant + Account (Phase 3.5 flow)
 *                              Default: "tenant"
 *
 *   SEED_ACCOUNT_ID            Account ID used only in account mode.
 *                              Default: generated UUID
 *
 *   SEED_ACCOUNT_DISPLAY_NAME  Display name used only in account mode.
 *                              Default: "Test Account"
 *
 *   SEED_TENANT_ID             Optional fixed tenant ID (for repeatable e2e tests).
 *                              Default: generated UUID
 *
 * E2E webhook verification cadence (recommended):
 * - Every time webhook processing logic changes (parser, routing, Dynamo writes, idempotency)
 * - Before each release
 * - After infra changes (SQS/Lambda/table/index/env vars)
 * - After adding a new channel (WhatsApp/TikTok/LinkedIn)
 *
 * Minimum recurring E2E suite:
 * 1) valid signed webhook -> persisted message/contact
 * 2) invalid signature -> 401
 * 3) unknown platformAccountId -> skipped/no writes
 * 4) duplicate externalMessageId -> no duplicate message
 * 5) both routing modes (tenant fallback + account path)
 */

import { randomUUID } from 'node:crypto'
import type { Channel } from '../packages/core/src/dynamo.ts'
// Relative import so Node.js resolves @aws-sdk/* from packages/core/node_modules
import { putAccount, putTenant } from '../packages/core/src/dynamo.ts'

const platformAccountId =
	process.env.SEED_PLATFORM_ACCOUNT_ID ?? 'YOUR_PAGE_ID_HERE'
const accessToken = process.env.SEED_ACCESS_TOKEN ?? 'YOUR_ACCESS_TOKEN_HERE'
const channel = (process.env.SEED_CHANNEL ?? 'instagram') as Channel
const name = process.env.SEED_TENANT_NAME ?? 'Test Tenant'
const plan = process.env.SEED_PLAN ?? 'starter'
const mode = (process.env.SEED_MODE ?? 'tenant') as 'tenant' | 'account'
const accountId = process.env.SEED_ACCOUNT_ID ?? randomUUID()
const accountDisplayName = process.env.SEED_ACCOUNT_DISPLAY_NAME ?? 'Test Account'

if (
	platformAccountId === 'YOUR_PAGE_ID_HERE' ||
	accessToken === 'YOUR_ACCESS_TOKEN_HERE'
) {
	console.warn(
		'⚠  Using placeholder values. Set SEED_PLATFORM_ACCOUNT_ID and SEED_ACCESS_TOKEN for a real tenant.',
	)
}

const tenantId = process.env.SEED_TENANT_ID ?? randomUUID()

console.log('\nSeeding tenant:')
console.log(`  tenantId          : ${tenantId}`)
console.log(`  platformAccountId : ${platformAccountId}`)
console.log(`  channel           : ${channel}`)
console.log(`  name              : ${name}`)
console.log(`  plan              : ${plan}`)
console.log(`  mode              : ${mode}`)
if (mode === 'account') {
	console.log(`  accountId         : ${accountId}`)
	console.log(`  accountName       : ${accountDisplayName}`)
}
console.log(`  table             : ${process.env.SOCIAL_CRM_TABLE_NAME}\n`)

const tenant = await putTenant({
	tenantId,
	platformAccountId,
	channel,
	name,
	plan,
	accessToken,
})

console.log(`✓ Tenant seeded successfully.`)
console.log(`  pk : ${tenant.pk}`)
console.log(`  sk : ${tenant.sk}`)

if (mode === 'account') {
	const account = await putAccount({
		tenantId,
		accountId,
		platformAccountId,
		channel,
		displayName: accountDisplayName,
		accessToken,
		clientLabel: name,
	})

	console.log(`✓ Account seeded successfully.`)
	console.log(`  pk : ${account.pk}`)
	console.log(`  sk : ${account.sk}`)
}
