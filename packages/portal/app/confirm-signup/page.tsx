import { Button, Input } from '@bridgebox/ui'

export default async function PortalConfirmSignupPage({
	searchParams,
}: {
	searchParams?: Promise<{ email?: string; error?: string; resent?: string }>
}) {
	const params = searchParams ? await searchParams : undefined
	const email = params?.email ?? ''
	const hasError = params?.error === 'confirm_failed'
	const wasResent = params?.resent === '1'

	return (
		<main className='mx-auto max-w-md space-y-6 p-6'>
			<h1>Confirm Portal Account</h1>
			{hasError ? (
				<p className='rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive'>
					Invalid or expired code. Try again.
				</p>
			) : null}
			{wasResent ? (
				<p className='rounded-md border border-border bg-secondary p-3 text-sm'>
					A new verification code was sent.
				</p>
			) : null}
			<form action='/auth/confirm-signup' method='post' className='space-y-4'>
				<p>
					<label htmlFor='email'>Email</label>
					<br />
					<Input id='email' name='email' type='email' required defaultValue={email} />
				</p>
				<p>
					<label htmlFor='code'>Verification Code</label>
					<br />
					<Input id='code' name='code' type='text' required />
				</p>
				<Button type='submit'>Confirm Account</Button>
			</form>
			<form action='/auth/resend-confirmation' method='post' className='space-y-2'>
				<input type='hidden' name='email' value={email} />
				<Button type='submit' variant='secondary'>
					Resend verification code
				</Button>
			</form>
			<p>
				Already confirmed? <a href='/login'>Go to login</a>
			</p>
		</main>
	)
}
