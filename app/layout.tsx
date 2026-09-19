import './globals.css'

export const metadata = {
  title: 'JudgeStack',
  description: 'Magic: The Gathering rules answers with the authority chain shown.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
