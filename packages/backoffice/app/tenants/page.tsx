import Link from 'next/dist/client/link'
import TenantListWrapper from '../../features/tenants/components/tenant-list-wrapper'

export default async function TenantsPage() {
	return (
		<>
			<div className="flex items-center justify-between">
				<h1>Tenants</h1>
				<Link href="/">← Back</Link>
			</div>
			<TenantListWrapper />
		</>
	)
}
