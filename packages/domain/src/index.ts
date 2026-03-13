export const roles = ['tenant_user', 'tenant_admin', 'platform_admin'] as const

export type Role = (typeof roles)[number]

export type UserContext = {
	userId: string
	role: Role
	tenantId?: string
}

// ─── Tenant ───────────────────────────────────────────────────────────────────

export const tenantPlans = ['solo', 'agency_basic', 'agency_pro'] as const
export type TenantPlan = (typeof tenantPlans)[number]

export const tenantStatuses = ['active', 'suspended'] as const
export type TenantStatus = (typeof tenantStatuses)[number]

/** Full tenant profile as stored in Aurora. */
export type TenantProfile = {
	tenantId: string
	businessName?: string
	contactName: string
	contactEmail: string
	country: string
	plan: TenantPlan
	/** null = unlimited (agency_pro); 1 = solo; N = agency_basic cap */
	clientLimit?: number
	status: TenantStatus
	createdAt: string
	updatedAt: string
}

/** Input for creating a new tenant (POST /tenants). */
export type CreateTenantInput = {
	contactName: string
	contactEmail: string
	country: string
	plan: TenantPlan
	businessName?: string
	/** Only relevant for agency_basic — defaults to 10 if omitted. */
	clientLimit?: number
	/** Internal label used in DynamoDB for routing logs. */
	operationalName: string
}

/** Input for updating an existing tenant profile (PATCH /tenants/:id). */
export type UpdateTenantInput = {
	businessName?: string | null
	contactName?: string
	contactEmail?: string
	country?: string
	plan?: TenantPlan
	status?: TenantStatus
}
