/**
 * Migration runner — executes SQL files in packages/core/migrations/ in order.
 * Run via: pnpm sst bind --stage dev node --experimental-strip-types packages/core/src/migrate.ts
 */
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getConfig() {
	const clusterArn = process.env.CRM_DB_CLUSTER_ARN
	const secretArn = process.env.CRM_DB_SECRET_ARN
	const database = process.env.CRM_DB_NAME ?? 'crmdb'
	if (!clusterArn || !secretArn) {
		throw new Error('CRM_DB_CLUSTER_ARN and CRM_DB_SECRET_ARN must be set')
	}
	return { clusterArn, secretArn, database }
}

async function run() {
	const { clusterArn, secretArn, database } = getConfig()
	const client = new RDSDataClient({})

	// Ensure migrations tracking table exists
	await client.send(
		new ExecuteStatementCommand({
			resourceArn: clusterArn,
			secretArn,
			database,
			sql: `
				CREATE TABLE IF NOT EXISTS schema_migrations (
					filename VARCHAR(255) PRIMARY KEY,
					applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`,
		}),
	)

	// Fetch already-applied migrations
	const applied = await client.send(
		new ExecuteStatementCommand({
			resourceArn: clusterArn,
			secretArn,
			database,
			sql: 'SELECT filename FROM schema_migrations ORDER BY filename',
		}),
	)
	const appliedSet = new Set(
		(applied.records ?? []).map((row) => row[0]?.stringValue ?? ''),
	)

	const migrationsDir = join(__dirname, '..', 'migrations')
	const files = readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.sort()

	for (const file of files) {
		if (appliedSet.has(file)) {
			console.log(`  skip  ${file}`)
			continue
		}
		const sql = readFileSync(join(migrationsDir, file), 'utf-8')
		console.log(`  apply ${file}`)
		await client.send(
			new ExecuteStatementCommand({ resourceArn: clusterArn, secretArn, database, sql }),
		)
		await client.send(
			new ExecuteStatementCommand({
				resourceArn: clusterArn,
				secretArn,
				database,
				sql: `INSERT INTO schema_migrations (filename) VALUES ('${file}')`,
			}),
		)
		console.log(`  done  ${file}`)
	}
	console.log('Migrations complete.')
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
