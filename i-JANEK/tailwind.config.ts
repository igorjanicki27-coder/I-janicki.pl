import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        janek: {
          bg0: 'var(--bg-0)',
          bg1: 'var(--bg-1)',
          bg2: 'var(--bg-2)',
          text: 'var(--text)',
          dim: 'var(--text-dim)',
          muted: 'var(--muted)',
          accent: 'var(--accent-1)',
          cyan: 'var(--accent-4)',
          white: 'var(--accent-5)'
        }
      },
      boxShadow: {
        neon: 'var(--shadow-neon)',
        glass: '0 20px 60px rgba(0, 0, 0, 0.35)'
      },
      borderColor: {
        panel: 'var(--panel-border)',
        soft: 'var(--border-soft)'
      },
      backdropBlur: {
        glass: '22px'
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config
