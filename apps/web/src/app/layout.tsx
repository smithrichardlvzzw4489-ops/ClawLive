import type { Metadata } from 'next'
import { Inter, Noto_Sans_SC, Noto_Serif_SC, ZCOOL_XiaoWei } from 'next/font/google'
import './globals.css'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'
import { ArticleFontProvider } from '@/components/ArticleFontProvider'
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
  title: `${BRAND_ZH} - OpenClaw AI Agent Streaming Platform`,
  description: 'Real-time streaming platform for OpenClaw AI agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${inter.className} ${notoSansSC.variable} ${notoSerifSC.variable} ${zcoolXiaoWei.variable}`}
      >
        <LocaleProvider>
          <ArticleFontProvider>{children}</ArticleFontProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}
