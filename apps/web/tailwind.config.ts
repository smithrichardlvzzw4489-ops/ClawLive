import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        lobster: {
          light: '#c4b5fd',   /* violet-300 */
          DEFAULT: '#8b5cf6', /* violet-500 */
          dark: '#6d28d9',    /* violet-700 */
        },
        cyber: {
          DEFAULT: '#22d3ee',
          dim: 'rgba(34,211,238,0.12)',
        },
        void: {
          950: '#07090f',
          900: '#0d1117',
          800: '#111827',
          700: '#131d2e',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(139,92,246,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(139,92,246,0.6)' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-in-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 20px rgba(0, 0, 0, 0.12)',
      },
      fontFamily: {
        'article-sans': ['var(--font-noto-sans-sc)', 'system-ui', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        'article-serif': ['var(--font-noto-serif-sc)', 'Noto Serif SC', 'Songti SC', 'serif'],
        'article-display': ['var(--font-zcool-xiaowei)', 'KaiTi', 'serif'],
      },
      typography: (theme: (path: string) => string) => ({
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: theme('colors.gray.800'),
            lineHeight: '1.75',
            '--tw-prose-body': theme('colors.gray.800'),
            '--tw-prose-headings': theme('colors.gray.900'),
            '--tw-prose-lead': theme('colors.gray.600'),
            '--tw-prose-links': theme('colors.lobster.DEFAULT'),
            '--tw-prose-bold': theme('colors.gray.900'),
            '--tw-prose-counters': theme('colors.gray.600'),
            '--tw-prose-bullets': theme('colors.gray.400'),
            '--tw-prose-hr': theme('colors.gray.200'),
            '--tw-prose-quotes': theme('colors.gray.700'),
            '--tw-prose-quote-borders': theme('colors.gray.300'),
            '--tw-prose-captions': theme('colors.gray.500'),
            '--tw-prose-code': theme('colors.gray.800'),
            '--tw-prose-pre-code': theme('colors.gray.100'),
            '--tw-prose-pre-bg': theme('colors.gray.900'),
            '--tw-prose-th-borders': theme('colors.gray.300'),
            '--tw-prose-td-borders': theme('colors.gray.200'),
            a: {
              fontWeight: '500',
              textDecorationColor: 'rgba(139, 92, 246, 0.35)',
            },
            /** 与常见正文排版接近：标题略大于正文，不夸张 */
            h1: {
              fontSize: theme('fontSize.2xl'),
              lineHeight: '1.35',
              fontWeight: '700',
              letterSpacing: '-0.02em',
              marginTop: theme('spacing.6'),
              marginBottom: theme('spacing.3'),
            },
            h2: {
              fontSize: theme('fontSize.xl'),
              lineHeight: '1.4',
              fontWeight: '600',
              letterSpacing: '-0.015em',
              marginTop: theme('spacing.6'),
              marginBottom: theme('spacing.2'),
            },
            h3: {
              fontSize: theme('fontSize.lg'),
              lineHeight: '1.45',
              fontWeight: '600',
              letterSpacing: '-0.01em',
              marginTop: theme('spacing.5'),
              marginBottom: theme('spacing.2'),
            },
            h4: {
              fontSize: theme('fontSize.base'),
              lineHeight: '1.5',
              fontWeight: '600',
              marginTop: theme('spacing.4'),
              marginBottom: theme('spacing.1.5'),
            },
            blockquote: {
              fontStyle: 'normal' as const,
              borderLeftColor: theme('colors.gray.300'),
              color: theme('colors.gray.700'),
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
}

export default config
