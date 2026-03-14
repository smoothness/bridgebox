import Link from 'next/link'
import { listTenantsForBackoffice } from '../services/tenants.server'

export default async function TenantListWrapper() {
	const { tenants, fetchError } = await listTenantsForBackoffice()

	return (
		<>
			{fetchError ? (
				<p className="text-red-600">{fetchError}</p>
			) : tenants.length === 0 ? (
				<p>No tenants yet.</p>
			) : (
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr className="border-b text-left">
							<th className="py-2 pr-4">Contact name</th>
							<th className="py-2 pr-4">Contact email</th>
							<th className="py-2 pr-4">Business name</th>
							<th className="py-2 pr-4">Country</th>
							<th className="py-2 pr-4">Plan</th>
							<th className="py-2 pr-4">Status</th>
							<th className="py-2 pr-4">Tenant ID</th>
							<th className="py-2">Actions</th>
						</tr>
					</thead>
					<tbody>
						{tenants.map((tenant) => (
							<tr key={tenant.tenantId} className="border-b">
								<td className="py-2 pr-4">{tenant.contactName}</td>
								<td className="py-2 pr-4">{tenant.contactEmail}</td>
								<td className="py-2 pr-4">{tenant.businessName ?? '—'}</td>
								<td className="py-2 pr-4">{tenant.country}</td>
								<td className="py-2 pr-4">{tenant.plan}</td>
								<td className="py-2 pr-4">{tenant.status}</td>
								<td className="py-2 pr-4 font-mono text-xs">
									{tenant.tenantId}
								</td>
								<td className="py-2">
									<Link href={`/tenants/${tenant.tenantId}`}>Edit</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</>
	)
}
