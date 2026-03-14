import { Button, Input, Label, Select } from '@bridgebox/ui'
import { getTenantByIdForBackoffice } from '../services/tenants.server'

type TenantEditWrapperProps = {
	params: Promise<{ tenantId: string }>
	searchParams?: Promise<{ saved?: string; error?: string }>
}

export default async function TenantEditWrapper({
	params,
	searchParams,
}: TenantEditWrapperProps) {
	const { tenantId } = await params
	const sp = searchParams ? await searchParams : undefined
	const saved = sp?.saved === '1'
	const errorCode = sp?.error

	const { tenant, fetchError } = await getTenantByIdForBackoffice(tenantId)

	return (
		<>
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
		</>
	)
}
