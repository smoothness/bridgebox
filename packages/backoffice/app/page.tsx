import { redirect } from 'next/navigation'
import { isAuthError, requireBackofficeAccess } from '../lib/auth'

export default async function BackofficeHomePage() {
	try {
		const session = await requireBackofficeAccess()
		return (
			<main>
				<h1>Bridgebox Backoffice</h1>
				<p>Access: allowed</p>
				<p>User: {session.user.userId}</p>
				<p>Role: {session.user.role}</p>
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
