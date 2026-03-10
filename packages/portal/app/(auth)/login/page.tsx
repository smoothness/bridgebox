import { Button, Input } from '@bridgebox/ui'
export default async function PortalLoginPage({
	searchParams,
}: {
	searchParams?: Promise<{ signup?: string; confirmed?: string; error?: string }>
}) {
	const params = searchParams ? await searchParams : undefined
	const showSignupSuccess = params?.signup === 'success'
	const showConfirmed = params?.confirmed === '1'
	const showInvalidCredentials = params?.error === 'invalid_credentials'
	const showError = params?.error === 'auth_failed'
	return (
		<main className="mx-auto max-w-md space-y-6 p-6">
			<h1>Portal Login</h1>
			{showSignupSuccess ? (
				<p className="rounded-md border border-border bg-secondary p-3 text-sm">
					Account created. Check your email for verification code.
				</p>
			) : null}
			{showConfirmed ? (
				<p className="rounded-md border border-border bg-secondary p-3 text-sm">
					Email confirmed. You can now log in.
				</p>
			) : null}
			{showError ? (
				<p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					Authentication failed. Please try again.
				</p>
			) : null}
			{showInvalidCredentials ? (
				<p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
					Invalid email or password.
				</p>
			) : null}
			<form action="/api/auth/login" method="post" className="space-y-4">
				<p>
					<label htmlFor="email">Email</label>
					<br />
					<Input id="email" name="email" type="email" required />
				</p>
				<p>
					<label htmlFor="password">Password</label>
					<br />
					<Input id="password" name="password" type="password" required />
				</p>
				<Button type="submit">Login</Button>
			</form>
			<div>
				<div className="mb-3">
					No account? <a href="/signin">Sign in</a>
				</div>
				<div>
					<p></p>
					<p>
					<a href="/api/auth/login?provider=Google">Continue with Google</a>
					</p>
					<p>
					<a href="/api/auth/login?provider=Facebook">Continue with Facebook</a>
					</p>
				</div>
			</div>
		</main>
	)
}
