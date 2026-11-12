/**
 * Design tokens — the website's palette (frontend/assets/styles/main.scss
 * `--color-*`, `--space-*`, `--radius-*`), so the app and evakuators.am read
 * as one brand. Values, not CSS variables: React Native has none.
 */
export const colors = {
  primary: '#14304f',
  primaryDark: '#0d2136',
  primaryLight: '#1d4470',
  primarySoft: '#e8eef6',
  accent: '#f6a821',
  accentDark: '#dd920f',
  accentSoft: '#fff4de',
  success: '#1d9e55',
  successSoft: '#e6f7ed',
  danger: '#d64545',
  dangerSoft: '#fdecec',
  warning: '#a86a00',
  warningSoft: '#fff6e0',
  bg: '#f4f6f9',
  surface: '#ffffff',
  border: '#e3e8ef',
  borderStrong: '#cfd7e2',
  text: '#1c2733',
  textSecondary: '#51617a',
  muted: '#8494a7',
  overlay: 'rgba(13, 33, 54, 0.55)',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 } as const

export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
}

/** The website's `--shadow-md`, as both platforms express it */
export const shadow = {
  card: {
    shadowColor: '#101e2e',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#101e2e',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const
