import Link from 'next/dist/client/link'

import TenantEditWrapper from '../../../features/tenants/components/tenant-edit-wrapper'

type TenantPageProps = {
	params: Promise<{ tenantId: string }>
	searchParams?: Promise<{ saved?: string; error?: string }>
}

export default async function TenantPage({
	params,
	searchParams,
}: TenantPageProps) {
	return (
		<main className="mx-auto max-w-5xl space-y-6 p-6">
			<div className="flex items-center justify-between">
				<h1>Edit Tenant</h1>
				<Link href="/">← Back</Link>
			</div>
			<TenantEditWrapper params={params} searchParams={searchParams} />
		</main>
	)
}
