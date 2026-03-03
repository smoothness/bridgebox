export const roles = ['tenant_user', 'tenant_admin', 'platform_admin'] as const

export type Role = (typeof roles)[number]

export type UserContext = {
	userId: string
	role: Role
	tenantId?: string
}
