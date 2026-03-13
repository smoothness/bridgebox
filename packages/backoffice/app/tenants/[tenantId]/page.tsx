import { createApiClient } from '@bridgebox/api-client'
import { isAuthError } from '@bridgebox/auth'
import { Button, Input, Label, Select } from '@bridgebox/ui'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireBackofficeAccess } from '../../../lib/utils/auth/auth'

export default async function TenantEditPage({
	params,
	searchParams,
}: {
	params: Promise<{ tenantId: string }>
	searchParams?: Promise<{ saved?: string; error?: string }>
}) {
	try {
		await requireBackofficeAccess()
	} catch (error) {
		if (isAuthError(error)) {
			if (error.message === 'UNAUTHENTICATED') redirect('/login')
			redirect('/forbidden')
		}
		throw error
	}

	const { tenantId } = await params
	const sp = searchParams ? await searchParams : undefined
	const saved = sp?.saved === '1'
	const errorCode = sp?.error

	const cookieStore = await cookies()
	const idToken =
		cookieStore.get('bb_id_token')?.value ??
		cookieStore.get('bb_access_token')?.value

	const apiBaseUrl = process.env.API_BASE_URL ?? ''
	const client = createApiClient({ baseUrl: apiBaseUrl, authToken: idToken })

	let tenant: Awaited<ReturnType<typeof client.listTenants>>[number] | undefined
	let fetchError: string | undefined

	try {
		const all = await client.listTenants()
		tenant = all.find((t) => t.tenantId === tenantId)
		if (!tenant) fetchError = 'Tenant not found.'
	} catch {
		fetchError = 'Failed to load tenant.'
	}

	return (
		<main className="mx-auto max-w-2xl space-y-6 p-6">
			<div className="flex items-center justify-between">
				<h1>Edit Tenant</h1>
				<Link href="/tenants">← Back to tenants</Link>
			</div>

			{saved && <p className="text-green-600">Tenant updated successfully.</p>}
			{errorCode && (
				<p className="text-red-600">
					<strong>Update failed:</strong> {errorCode}
				</p>
			)}
			{fetchError && <p className="text-red-600">{fetchError}</p>}

			{tenant && (
				<form
					action={`/api/admin/tenants/${tenantId}`}
					method="post"
					className="space-y-3"
				>
					<div className="space-y-1">
						<Label htmlFor="contactName">Contact name</Label>
						<Input
							id="contactName"
							name="contactName"
							defaultValue={tenant.contactName}
							required
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="contactEmail">Contact email</Label>
						<Input
							id="contactEmail"
							name="contactEmail"
							type="email"
							defaultValue={tenant.contactEmail}
							required
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="country">Country</Label>
						<Input
							id="country"
							name="country"
							defaultValue={tenant.country}
							required
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="businessName">Business name (optional)</Label>
						<Input
							id="businessName"
							name="businessName"
							defaultValue={tenant.businessName ?? ''}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="plan">Plan</Label>
						<Select id="plan" name="plan" defaultValue={tenant.plan}>
							<option value="solo">solo</option>
							<option value="agency_basic">agency_basic</option>
							<option value="agency_pro">agency_pro</option>
						</Select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="status">Status</Label>
						<Select id="status" name="status" defaultValue={tenant.status}>
							<option value="active">active</option>
							<option value="suspended">suspended</option>
						</Select>
					</div>
					<div className="space-y-1">
						<Label>Tenant ID (read-only)</Label>
						<p className="font-mono text-sm">{tenant.tenantId}</p>
					</div>
					<Button type="submit">Save changes</Button>
				</form>
			)}
		</main>
	)
}
