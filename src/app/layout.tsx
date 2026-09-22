import type { Metadata } from 'next'
import { Google_Sans, Press_Start_2P } from 'next/font/google'
import './globals.css'

const googleSans = Google_Sans({ variable: '--font-google-sans', subsets: ['latin'] })

const pressStart = Press_Start_2P({ variable: '--font-press-start', weight: '400', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Flappy Jev: Flappy Bird where you compete with Jev',
  description: "Play Flappy Bird head to head against Jev, TypeSafe's System One model. Same pipes, same physics: you on the left, the AI flying the right by returning a typed FLAP decision in milliseconds.",
  icons: { icon: [{ url: '/logo.svg', type: 'image/svg+xml' }], apple: '/logo.png' },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${googleSans.variable} ${pressStart.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
