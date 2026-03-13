/**
 * Migration runner Lambda handler.
 * Invoked by the SST Script construct (onCreate / onUpdate) so migrations run
 * automatically during `sst deploy`. The Lambda execution role already has
 * rds-data:ExecuteStatement and secretsmanager:GetSecretValue permissions.
 */
import { ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data'

// SQL migrations in order — each entry is an array of individual statements
// (RDS Data API executes one statement per call).
const migrations: Array<{ filename: string; statements: string[] }> = [
	{
		filename: '001_create_tenants.sql',
		// CREATE TYPE has no IF NOT EXISTS in PostgreSQL; use DO/EXCEPTION instead.
		statements: [
			`DO $$ BEGIN
  CREATE TYPE tenant_plan AS ENUM ('solo', 'agency_basic', 'agency_pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
			`DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$`,
			`CREATE TABLE IF NOT EXISTS tenants (
  tenant_id     UUID          PRIMARY KEY,
  business_name VARCHAR(255),
  contact_name  VARCHAR(255)  NOT NULL,
  contact_email VARCHAR(255)  NOT NULL,
  country       VARCHAR(100)  NOT NULL,
  plan          tenant_plan   NOT NULL DEFAULT 'solo',
  client_limit  INTEGER,
  status        tenant_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
)`,
			`CREATE INDEX IF NOT EXISTS idx_tenants_plan   ON tenants (plan)`,
			`CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status)`,
		],
	},
]

export const handler = async () => {
	const clusterArn = process.env.CRM_DB_CLUSTER_ARN
	const secretArn = process.env.CRM_DB_SECRET_ARN
	const database = process.env.CRM_DB_NAME ?? 'crmdb'

	if (!clusterArn || !secretArn) {
		throw new Error('CRM_DB_CLUSTER_ARN and CRM_DB_SECRET_ARN must be set')
	}

	const client = new RDSDataClient({})
	const base = { resourceArn: clusterArn, secretArn, database }

	// Ensure tracking table exists
	await client.send(
		new ExecuteStatementCommand({
			...base,
			sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename   VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `,
		}),
	)

	// Fetch already-applied migrations
	const applied = await client.send(
		new ExecuteStatementCommand({
			...base,
			sql: 'SELECT filename FROM schema_migrations ORDER BY filename',
		}),
	)
	const appliedSet = new Set(
	(applied.records ?? []).map((row: { stringValue?: string }[]) => row[0]?.stringValue ?? ''),
	)

	// Apply pending migrations in order
	for (const migration of migrations) {
		if (appliedSet.has(migration.filename)) {
			console.log(`skip  ${migration.filename}`)
			continue
		}
		console.log(`apply ${migration.filename}`)
		for (const sql of migration.statements) {
			await client.send(new ExecuteStatementCommand({ ...base, sql }))
		}
		await client.send(
			new ExecuteStatementCommand({
				...base,
				sql: `INSERT INTO schema_migrations (filename) VALUES ('${migration.filename}')`,
			}),
		)
		console.log(`done  ${migration.filename}`)
	}

	console.log('Migrations complete.')
	return { status: 'ok', applied: migrations.length }
}
