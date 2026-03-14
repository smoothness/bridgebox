import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Footer } from '../components/layout/footer'
import { Header } from '../components/layout/header'

import './globals.css'

export const metadata: Metadata = {
	title: 'Bridgebox Backoffice',
	description: 'Bridgebox internal backoffice',
}

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<div className="wrapper">
					<Header />
					<main className="mx-auto max-w-5xl space-y-6 p-6">{children}</main>
					<Footer />
				</div>
			</body>
		</html>
	)
}
