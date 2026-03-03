import { Button, Input } from '@bridgebox/ui'
export default function PortalLoginPage() {
	return (
		<main>
			<h1>Portal Login</h1>
			<form action='/login' method='get'>
				<p>
					<label htmlFor='email'>Email</label>
					<br />
					<Input id='email' name='email' type='email' required />
				</p>
				<p>
					<label htmlFor='password'>Password</label>
					<br />
					<Input id='password' name='password' type='password' required />
				</p>
				<Button type='submit'>Login</Button>
			</form>
			<p>
				<a href='/auth/login?provider=Google'>Continue with Google</a>
			</p>
			<p>
				<a href='/auth/login?provider=Facebook'>Continue with Facebook</a>
			</p>
		</main>
	)
}
