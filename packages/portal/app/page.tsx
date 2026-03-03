import { redirect } from 'next/navigation'
import { isAuthError, requirePortalAccess } from '../lib/auth'

export default async function PortalHomePage() {
	try {
		const session = await requirePortalAccess()
		return (
			<main>
				<h1>Bridgebox Portal</h1>
				<p>Access: allowed</p>
				<p>User: {session.user.userId}</p>
				<p>Role: {session.user.role}</p>
				<p>Tenant: {session.user.tenantId}</p>
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
