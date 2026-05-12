import './style.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'AI Ins Next.js Playground',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='zh-CN'>
      <body>{children}</body>
    </html>
  )
}
