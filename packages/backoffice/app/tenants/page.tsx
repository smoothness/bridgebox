import { createApiClient } from '@bridgebox/api-client'
import { isAuthError } from '@bridgebox/auth'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireBackofficeAccess } from '../../lib/utils/auth/auth'

export default async function TenantsPage() {
	try {
		await requireBackofficeAccess()
	} catch (error) {
		if (isAuthError(error)) {
			if (error.message === 'UNAUTHENTICATED') redirect('/login')
			redirect('/forbidden')
		}
		throw error
	}

	const cookieStore = await cookies()
	const idToken =
		cookieStore.get('bb_id_token')?.value ??
		cookieStore.get('bb_access_token')?.value

	const apiBaseUrl = process.env.API_BASE_URL ?? ''
	const client = createApiClient({ baseUrl: apiBaseUrl, authToken: idToken })

	let tenants: Awaited<ReturnType<typeof client.listTenants>> = []
	let fetchError: string | undefined

	try {
		tenants = await client.listTenants()
	} catch {
		fetchError = 'Failed to load tenants.'
	}

	return (
		<main className="mx-auto max-w-5xl space-y-6 p-6">
			<div className="flex items-center justify-between">
				<h1>Tenants</h1>
				<Link href="/">← Back</Link>
			</div>

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
						{tenants.map((t) => (
							<tr key={t.tenantId} className="border-b">
								<td className="py-2 pr-4">{t.contactName}</td>
								<td className="py-2 pr-4">{t.contactEmail}</td>
								<td className="py-2 pr-4">{t.businessName ?? '—'}</td>
								<td className="py-2 pr-4">{t.country}</td>
								<td className="py-2 pr-4">{t.plan}</td>
								<td className="py-2 pr-4">{t.status}</td>
								<td className="py-2 pr-4 font-mono text-xs">{t.tenantId}</td>
								<td className="py-2">
									<Link href={`/tenants/${t.tenantId}`}>Edit</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</main>
	)
}
