import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          active: 'var(--color-primary-active)',
          disabled: 'var(--color-primary-disabled)',
        },
        accent: {
          yellow: 'var(--color-accent-yellow)',
        },
        canvas: 'var(--color-canvas)',
        surface: {
          soft: 'var(--color-surface-soft)',
          strong: 'var(--color-surface-strong)',
          dark: 'var(--color-surface-dark)',
          'dark-elevated': 'var(--color-surface-dark-elevated)',
        },
        hairline: {
          DEFAULT: 'var(--color-hairline)',
          soft: 'var(--color-hairline-soft)',
        },
        ink: 'var(--color-ink)',
        body: {
          DEFAULT: 'var(--color-body)',
          strong: 'var(--color-body-strong)',
        },
        muted: {
          DEFAULT: 'var(--color-muted)',
          soft: 'var(--color-muted-soft)',
        },
        'on-primary': 'var(--color-on-primary)',
        'on-dark': {
          DEFAULT: 'var(--color-on-dark)',
          soft: 'var(--color-on-dark-soft)',
        },
        semantic: {
          up: 'var(--color-semantic-up)',
          down: 'var(--color-semantic-down)',
        },
      },
      borderRadius: {
        none: 'var(--radius-none)',
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
        full: 'var(--radius-full)',
      },
      spacing: {
        xxs: 'var(--space-xxs)',
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        base: 'var(--space-base)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
        xxl: 'var(--space-xxl)',
        section: 'var(--space-section)',
        card: 'var(--card-padding)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        focus: 'var(--focus-ring)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        'display-mega': [
          'var(--type-display-mega-size)',
          { lineHeight: 'var(--type-display-mega-lh)', letterSpacing: 'var(--type-display-mega-ls)' },
        ],
        'display-xl': [
          'var(--type-display-xl-size)',
          { lineHeight: 'var(--type-display-xl-lh)', letterSpacing: 'var(--type-display-xl-ls)' },
        ],
        'display-lg': [
          'var(--type-display-lg-size)',
          { lineHeight: 'var(--type-display-lg-lh)', letterSpacing: 'var(--type-display-lg-ls)' },
        ],
        'display-md': [
          'var(--type-display-md-size)',
          { lineHeight: 'var(--type-display-md-lh)', letterSpacing: 'var(--type-display-md-ls)' },
        ],
        'display-sm': [
          'var(--type-display-sm-size)',
          { lineHeight: 'var(--type-display-sm-lh)', letterSpacing: 'var(--type-display-sm-ls)' },
        ],
        'title-lg': [
          'var(--type-title-lg-size)',
          { lineHeight: 'var(--type-title-lg-lh)', letterSpacing: 'var(--type-title-lg-ls)' },
        ],
        'title-md': ['var(--type-title-md-size)', { lineHeight: 'var(--type-title-md-lh)' }],
        'title-sm': ['var(--type-title-sm-size)', { lineHeight: 'var(--type-title-sm-lh)' }],
        'body-md': ['var(--type-body-md-size)', { lineHeight: 'var(--type-body-md-lh)' }],
        'body-strong': ['var(--type-body-strong-size)', { lineHeight: 'var(--type-body-strong-lh)' }],
        'body-sm': ['var(--type-body-sm-size)', { lineHeight: 'var(--type-body-sm-lh)' }],
        caption: ['var(--type-caption-size)', { lineHeight: 'var(--type-caption-lh)' }],
        'caption-strong': [
          'var(--type-caption-strong-size)',
          { lineHeight: 'var(--type-caption-strong-lh)' },
        ],
        number: ['var(--type-number-display-size)', { lineHeight: 'var(--type-number-display-lh)' }],
        button: ['var(--type-button-size)', { lineHeight: 'var(--type-button-lh)' }],
        nav: ['var(--type-nav-link-size)', { lineHeight: 'var(--type-nav-link-lh)' }],
      },
      fontWeight: {
        display: 'var(--display-weight)',
        'title-lg': 'var(--type-title-lg-weight)',
        'title-md': 'var(--type-title-md-weight)',
        'title-sm': 'var(--type-title-sm-weight)',
        'body-md': 'var(--type-body-md-weight)',
        'body-strong': 'var(--type-body-strong-weight)',
        'caption-strong': 'var(--type-caption-strong-weight)',
        number: 'var(--type-number-display-weight)',
        button: 'var(--type-button-weight)',
        nav: 'var(--type-nav-link-weight)',
      },
    },
  },
  plugins: [],
}

export default config
