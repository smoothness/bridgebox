import { putMembership } from '../packages/core/src/dynamo.ts'

const principalId = process.env.SEED_PRINCIPAL_ID ?? ''
const email = process.env.SEED_EMAIL ?? ''
const app = (process.env.SEED_APP ?? 'portal') as 'portal' | 'backoffice'
const role = (process.env.SEED_ROLE ?? 'tenant_user') as
	| 'tenant_user'
	| 'tenant_admin'
	| 'platform_admin'
const tenantId = process.env.SEED_TENANT_ID

if (!principalId || !email) {
	throw new Error('SEED_PRINCIPAL_ID and SEED_EMAIL are required')
}

if (app === 'portal' && !tenantId) {
	throw new Error('SEED_TENANT_ID is required when SEED_APP=portal')
}

if (app === 'backoffice' && role !== 'platform_admin') {
	throw new Error('SEED_ROLE must be platform_admin when SEED_APP=backoffice')
}

console.log('\nSeeding membership:')
console.log(`  principalId : ${principalId}`)
console.log(`  email       : ${email}`)
console.log(`  app         : ${app}`)
console.log(`  role        : ${role}`)
if (tenantId) console.log(`  tenantId    : ${tenantId}`)
console.log(`  table       : ${process.env.SOCIAL_CRM_TABLE_NAME}\n`)

const membership = await putMembership({
	principalId,
	email,
	app,
	role,
	tenantId,
})

console.log('✓ Membership seeded successfully.')
console.log(`  pk : ${membership.pk}`)
console.log(`  sk : ${membership.sk}`)
