import { redirect } from 'next/navigation'
import { Button } from '@bridgebox/ui'
import { isAuthError, requirePortalAccess } from '../lib/utils/auth/auth'

export default async function PortalHomePage() {
	try {
		const session = await requirePortalAccess()
		return (
			<main className="mx-auto max-w-2xl space-y-4 p-6">
				<h1>Bridgebox Portal</h1>
				<p>Access: allowed</p>
				<p>User: {session.user.userId}</p>
				<p>Role: {session.user.role}</p>
				<p>Tenant: {session.user.tenantId}</p>
				<form action="/api/auth/logout" method="post">
					<Button type="submit" variant="outline">
						Logout
					</Button>
				</form>
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
