/**
 * Seed script — inserts a test Tenant into SocialCRMTable.
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
 */

import { randomUUID } from 'node:crypto'
import type { Channel } from '../packages/core/src/dynamo.ts'
// Relative import so Node.js resolves @aws-sdk/* from packages/core/node_modules
import { putTenant } from '../packages/core/src/dynamo.ts'

const platformAccountId =
	process.env.SEED_PLATFORM_ACCOUNT_ID ?? 'YOUR_PAGE_ID_HERE'
const accessToken = process.env.SEED_ACCESS_TOKEN ?? 'YOUR_ACCESS_TOKEN_HERE'
const channel = (process.env.SEED_CHANNEL ?? 'instagram') as Channel
const name = process.env.SEED_TENANT_NAME ?? 'Test Tenant'
const plan = process.env.SEED_PLAN ?? 'starter'

if (
	platformAccountId === 'YOUR_PAGE_ID_HERE' ||
	accessToken === 'YOUR_ACCESS_TOKEN_HERE'
) {
	console.warn(
		'⚠  Using placeholder values. Set SEED_PLATFORM_ACCOUNT_ID and SEED_ACCESS_TOKEN for a real tenant.',
	)
}

const tenantId = randomUUID()

console.log('\nSeeding tenant:')
console.log(`  tenantId          : ${tenantId}`)
console.log(`  platformAccountId : ${platformAccountId}`)
console.log(`  channel           : ${channel}`)
console.log(`  name              : ${name}`)
console.log(`  plan              : ${plan}`)
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
