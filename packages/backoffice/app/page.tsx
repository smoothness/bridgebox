import { redirect } from 'next/navigation'
import { Button, Input, Label, Select } from '@bridgebox/ui'
import { isAuthError, requireBackofficeAccess } from '../lib/utils/auth/auth'
export default async function BackofficeHomePage({
	searchParams,
}: {
	searchParams?: Promise<{
		tenant_created?: string
		tenant_id?: string
		membership_created?: string
		membership_app?: string
		membership_email?: string
		error?: string
	}>
}) {
	const params = searchParams ? await searchParams : undefined
	const showTenantCreated = params?.tenant_created === '1'
	const showMembershipCreated = params?.membership_created === '1'
	const errorCode = params?.error
	try {
		const session = await requireBackofficeAccess()
		return (
			<main className="mx-auto max-w-2xl space-y-6 p-6">
				<h1>Bridgebox Backoffice</h1>
				<p>Access: allowed</p>
				<p>User: {session.user.userId}</p>
				<p>Role: {session.user.role}</p>
				{showTenantCreated ? (
					<p>
						Tenant created successfully. Tenant ID:{' '}
						<strong>{params?.tenant_id}</strong>
					</p>
				) : null}
				{showMembershipCreated ? (
					<p>
						Membership assigned for <strong>{params?.membership_email}</strong> in{' '}
						<strong>{params?.membership_app}</strong>.
					</p>
				) : null}
				{errorCode ? (
					<p>
						<strong>Action failed:</strong> {errorCode}
					</p>
				) : null}
				<form action="/api/auth/logout" method="post">
					<Button type="submit" variant="outline">
						Logout
					</Button>
				</form>
				<section>
					<h2>Create Tenant</h2>
				<form action="/api/admin/tenants" method="post" className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="tenantName">Tenant name</Label>
							<Input id="tenantName" name="tenantName" required />
						</div>
						<div className="space-y-1">
							<Label htmlFor="tenantPlan">Plan</Label>
							<Input id="tenantPlan" name="tenantPlan" defaultValue="starter" required />
						</div>
						<Button type="submit">Create Tenant</Button>
					</form>
				</section>
				<section>
					<h2>Assign Membership</h2>
				<form action="/api/admin/memberships" method="post" className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="principalId">Principal ID (sub)</Label>
							<Input id="principalId" name="principalId" />
						</div>
						<div className="space-y-1">
							<Label htmlFor="email">Email</Label>
							<Input id="email" name="email" type="email" required />
						</div>
						<div className="space-y-1">
							<Label htmlFor="appTarget">App</Label>
							<Select id="appTarget" name="appTarget" defaultValue="portal">
								<option value="portal">portal</option>
								<option value="backoffice">backoffice</option>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="role">Role</Label>
							<Select id="role" name="role" defaultValue="tenant_user">
								<option value="tenant_user">tenant_user</option>
								<option value="tenant_admin">tenant_admin</option>
								<option value="platform_admin">platform_admin</option>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="tenantId">Tenant ID (portal only)</Label>
							<Input id="tenantId" name="tenantId" />
						</div>
						<Button type="submit">Assign Membership</Button>
					</form>
				</section>
			</main>
		)
	} catch (error) {
		if (isAuthError(error)) {
			if (error.message === 'UNAUTHENTICATED') {
				redirect('/login')
			}
			redirect('/forbidden')
		}
		throw error
	}
}
