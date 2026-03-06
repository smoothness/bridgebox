'use client'
export const dynamic = 'force-dynamic'

import { Button, Input } from '@bridgebox/ui'
import { useEffect, useMemo, useState } from 'react'

export default function BackofficeSigninPage() {
	const [error, setError] = useState<string | undefined>(undefined)
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)
	const passwordsMatch = useMemo(
		() => password.length === 0 || confirmPassword.length === 0 || password === confirmPassword,
		[password, confirmPassword],
	)
	const canSubmit =
		password.length > 0 && confirmPassword.length > 0 && password === confirmPassword

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		setError(params.get('error') ?? undefined)
	}, [])
	return (
		<main className='mx-auto max-w-md space-y-6 p-6'>
			<h1>Backoffice Sign In</h1>
			{error === 'weak_password' ? (
				<p className='rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive'>
					Password is too weak. Use at least 8 characters with uppercase, lowercase,
					number, and special character.
				</p>
			) : null}
			{error === 'signup_failed' ? (
				<p className='rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive'>
					Signup failed. Please review your information and try again.
				</p>
			) : null}
			<form action='/auth/signin' method='post' className='space-y-4'>
				<p>
					<label htmlFor='fullName'>Full Name</label>
					<br />
					<Input id='fullName' name='fullName' type='text' required />
				</p>
				<p>
					<label htmlFor='email'>Email</label>
					<br />
					<Input id='email' name='email' type='email' required />
				</p>
				<div>
					<label htmlFor='password'>Password</label>
					<br />
					<div className='flex gap-2'>
						<Input
							id='password'
							name='password'
							type={showPassword ? 'text' : 'password'}
							required
							minLength={8}
							title='At least 8 characters with uppercase, lowercase, number, and special character'
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						<Button type='button' variant='secondary' onClick={() => setShowPassword((v) => !v)}>
							{showPassword ? 'Hide' : 'Show'}
						</Button>
					</div>
				</div>
				<div>
					<label htmlFor='confirmPassword'>Confirm Password</label>
					<br />
					<div className='flex gap-2'>
						<Input
							id='confirmPassword'
							name='confirmPassword'
							type={showConfirmPassword ? 'text' : 'password'}
							required
							minLength={8}
							value={confirmPassword}
							onChange={(event) => setConfirmPassword(event.target.value)}
						/>
						<Button
							type='button'
							variant='secondary'
							onClick={() => setShowConfirmPassword((v) => !v)}
						>
							{showConfirmPassword ? 'Hide' : 'Show'}
						</Button>
					</div>
				</div>
				{!passwordsMatch ? (
					<p className='rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive'>
						Passwords do not match.
					</p>
				) : null}
				<p className='text-sm text-muted-foreground'>
					Password must be 8+ chars and include uppercase, lowercase, number, and
					special character.
				</p>
				<Button type='submit' disabled={!canSubmit}>
					Sign in
				</Button>
			</form>
			<p>
				Already have an account? <a href='/login'>Login</a>
			</p>
		</main>
	)
}
