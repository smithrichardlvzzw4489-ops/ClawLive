import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, Noto_Sans_SC, Noto_Serif_SC, ZCOOL_XiaoWei } from 'next/font/google'
import './globals.css'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'
import { PrimaryPersonaProvider } from '@/contexts/PrimaryPersonaContext'
import { ArticleFontProvider } from '@/components/ArticleFontProvider'
import { AgentChatWidget } from '@/components/AgentChatWidget'
import { BRAND_ZH } from '@/lib/brand'

const inter = Inter({ subsets: ['latin'] })

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
})

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-noto-serif-sc',
  display: 'swap',
})

const zcoolXiaoWei = ZCOOL_XiaoWei({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-zcool-xiaowei',
  display: 'swap',
})

const metadataBase =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  'https://www.clawlab.live';

export const metadata: Metadata = {
  metadataBase: new URL(metadataBase),
  title: `${BRAND_ZH} — developer profiles & AI agents`,
  description: 'GITLINK: developer profiles, agents, and live collaboration.',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} ${notoSansSC.variable} ${notoSerifSC.variable} ${zcoolXiaoWei.variable}`}
      >
        <LocaleProvider>
          <PrimaryPersonaProvider>
            <ArticleFontProvider>{children}</ArticleFontProvider>
          </PrimaryPersonaProvider>
          {/* <AgentChatWidget /> */}
        </LocaleProvider>
      </body>
    </html>
  )
}
