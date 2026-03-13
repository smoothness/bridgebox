import {
	ExecuteStatementCommand,
	type Field,
	RDSDataClient,
} from '@aws-sdk/client-rds-data'
import type {
	CreateTenantInput,
	TenantPlan,
	TenantProfile,
	TenantStatus,
	UpdateTenantInput,
} from '@bridgebox/domain'

// ─── Client ──────────────────────────────────────────────────────────────────

const rdsClient = new RDSDataClient({})

function getConfig() {
	const clusterArn = process.env.CRM_DB_CLUSTER_ARN
	const secretArn = process.env.CRM_DB_SECRET_ARN
	const database = process.env.CRM_DB_NAME ?? 'crmdb'
	if (!clusterArn || !secretArn) {
		throw new Error('CRM_DB_CLUSTER_ARN and CRM_DB_SECRET_ARN must be set')
	}
	return { clusterArn, secretArn, database }
}

async function sql(
	query: string,
	parameters?: { name: string; value: Field }[],
) {
	const { clusterArn, secretArn, database } = getConfig()
	return rdsClient.send(
		new ExecuteStatementCommand({
			resourceArn: clusterArn,
			secretArn,
			database,
			sql: query,
			parameters,
			formatRecordsAs: 'JSON',
		}),
	)
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): TenantProfile {
	return {
		tenantId: row.tenant_id as string,
		businessName: (row.business_name as string | null) ?? undefined,
		contactName: row.contact_name as string,
		contactEmail: row.contact_email as string,
		country: row.country as string,
		plan: row.plan as TenantPlan,
		clientLimit: (row.client_limit as number | null) ?? undefined,
		status: row.status as TenantStatus,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
	}
}

function parseRows(result: Awaited<ReturnType<typeof sql>>): TenantProfile[] {
	if (!result.formattedRecords) return []
	const rows = JSON.parse(result.formattedRecords) as Record<string, unknown>[]
	return rows.map(rowToProfile)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function createTenantProfile(
	tenantId: string,
	input: CreateTenantInput,
): Promise<TenantProfile> {
	const clientLimit =
		input.plan === 'solo'
			? 1
			: input.plan === 'agency_basic'
				? (input.clientLimit ?? 10)
				: null // agency_pro = unlimited

	await sql(
		`INSERT INTO tenants
			(tenant_id, business_name, contact_name, contact_email, country, plan, client_limit)
		VALUES
			(:tenant_id::uuid, :business_name, :contact_name, :contact_email, :country, :plan::tenant_plan, :client_limit)`,
		[
			{ name: 'tenant_id', value: { stringValue: tenantId } },
			{
				name: 'business_name',
				value: input.businessName
					? { stringValue: input.businessName }
					: { isNull: true },
			},
			{ name: 'contact_name', value: { stringValue: input.contactName } },
			{
				name: 'contact_email',
				value: { stringValue: input.contactEmail.trim().toLowerCase() },
			},
			{ name: 'country', value: { stringValue: input.country } },
			{ name: 'plan', value: { stringValue: input.plan } },
			{
				name: 'client_limit',
				value:
					clientLimit !== null ? { longValue: clientLimit } : { isNull: true },
			},
		],
	)

	const profile = await getTenantProfileById(tenantId)

	if (!profile)
		throw new Error(`Failed to fetch tenant profile after insert: ${tenantId}`)
	return profile
}

export async function getTenantProfileById(
	tenantId: string,
): Promise<TenantProfile | undefined> {
	const result = await sql(
		'SELECT * FROM tenants WHERE tenant_id = :tenant_id::uuid',
		[{ name: 'tenant_id', value: { stringValue: tenantId } }],
	)
	const rows = parseRows(result)
	return rows[0]
}

export async function updateTenantProfile(
	tenantId: string,
	input: UpdateTenantInput,
): Promise<TenantProfile> {
	const setClauses: string[] = ['updated_at = NOW()']
	const params: { name: string; value: Field }[] = [
		{ name: 'tenant_id', value: { stringValue: tenantId } },
	]

	if (input.businessName !== undefined) {
		setClauses.push('business_name = :business_name')
		params.push({
			name: 'business_name',
			value: input.businessName
				? { stringValue: input.businessName }
				: { isNull: true },
		})
	}
	if (input.contactName !== undefined) {
		setClauses.push('contact_name = :contact_name')
		params.push({
			name: 'contact_name',
			value: { stringValue: input.contactName },
		})
	}
	if (input.contactEmail !== undefined) {
		setClauses.push('contact_email = :contact_email')
		params.push({
			name: 'contact_email',
			value: { stringValue: input.contactEmail.trim().toLowerCase() },
		})
	}
	if (input.country !== undefined) {
		setClauses.push('country = :country')
		params.push({ name: 'country', value: { stringValue: input.country } })
	}
	if (input.plan !== undefined) {
		setClauses.push('plan = :plan::tenant_plan')
		params.push({ name: 'plan', value: { stringValue: input.plan } })
	}
	if (input.status !== undefined) {
		setClauses.push('status = :status::tenant_status')
		params.push({ name: 'status', value: { stringValue: input.status } })
	}

	await sql(
		`UPDATE tenants SET ${setClauses.join(', ')} WHERE tenant_id = :tenant_id::uuid`,
		params,
	)

	const profile = await getTenantProfileById(tenantId)
	if (!profile) throw new Error(`Tenant not found after update: ${tenantId}`)
	return profile
}

export async function listTenantProfiles(): Promise<TenantProfile[]> {
	const result = await sql('SELECT * FROM tenants ORDER BY created_at DESC')
	return parseRows(result)
}
