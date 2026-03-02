import { execSync } from 'node:child_process'

const tableName = process.env.SOCIAL_CRM_TABLE_NAME
if (!tableName) throw new Error('SOCIAL_CRM_TABLE_NAME is required')

const tenants = ['e2e-tenant-only-001', 'e2e-tenant-account-001']
const accountId = 'acct_e2e_001'
const senders = ['SENDER_E2E_TENANT_001', 'SENDER_E2E_ACCOUNT_001']

async function queryKeys(pk: string): Promise<Array<{ pk: string; sk: string }>> {
	const raw = execSync(
		`aws dynamodb query --profile bridgebox-dev --region us-east-2 --table-name ${tableName} --key-condition-expression "pk = :pk" --expression-attribute-values '{":pk":{"S":"${pk}"}}' --projection-expression "pk, sk" --output json`,
		{ encoding: 'utf8' },
	)
	const out = JSON.parse(raw) as {
		Items?: Array<{ pk: { S: string }; sk: { S: string } }>
	}
	return (out.Items ?? []).map((i) => ({ pk: i.pk.S, sk: i.sk.S }))
}

async function deleteByPk(pk: string): Promise<number> {
	const keys = await queryKeys(pk)
	for (const key of keys) {
		execSync(
			`aws dynamodb delete-item --profile bridgebox-dev --region us-east-2 --table-name ${tableName} --key '{"pk":{"S":"${key.pk}"},"sk":{"S":"${key.sk}"}}'`,
		)
	}
	return keys.length
}

async function run() {
	let deleted = 0

	for (const tenantId of tenants) {
		deleted += await deleteByPk(`TENANT#${tenantId}`)
		deleted += await deleteByPk(`TENANT#${tenantId}#ACCOUNT#${tenantId}`)
		for (const sender of senders) {
			deleted += await deleteByPk(
				`TENANT#${tenantId}#ACCOUNT#${tenantId}#CONTACT#${sender}`,
			)
		}
	}

	deleted += await deleteByPk(`TENANT#e2e-tenant-account-001#ACCOUNT#${accountId}`)
	for (const sender of senders) {
		deleted += await deleteByPk(
			`TENANT#e2e-tenant-account-001#ACCOUNT#${accountId}#CONTACT#${sender}`,
		)
	}

	console.log(`✅ E2E cleanup complete. Deleted ${deleted} items.`)
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})

