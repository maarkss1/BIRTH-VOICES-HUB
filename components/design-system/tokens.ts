// ============================================================================
// BIRTH HUB 360 - ENTERPRISE DESIGN TOKENS
// ============================================================================

export const colors = {
  light: {
    primary: 'var(--brand-color, #ff5618)',
    primaryHover: 'var(--brand-color-700, #d84914)',
    secondary: '#64748b', // slate-500
    success: '#10b981', // emerald-500
    warning: '#f59e0b', // amber-500
    danger: '#ef4444', // red-500
    info: '#3b82f6', // blue-500
    neutral: '#475569', // slate-600
    surface: '#ffffff',
    surfaceMuted: '#f7f5f3',
    background: '#f7f5f3',
    border: '#e7e3df',
    borderHover: '#cbd5e1', // slate-300
    overlay: 'rgba(15, 23, 42, 0.4)', // slate-900 with opacity
    textPrimary: '#333333',
    textSecondary: '#5b6169',
    textMuted: '#94a3b8', // slate-400
  },
  dark: {
    primary: 'var(--brand-color, #ff7a45)',
    primaryHover: 'var(--brand-color-500, #ff9466)',
    secondary: '#94a3b8', // slate-400
    success: '#34d399', // emerald-400
    warning: '#fbbf24', // amber-400
    danger: '#f87171', // red-400
    info: '#60a5fa', // blue-400
    neutral: '#94a3b8', // slate-400
    surface: '#242322',
    surfaceMuted: '#171615',
    background: '#171615',
    border: '#3d3a37',
    borderHover: '#5b5651',
    overlay: 'rgba(0, 0, 0, 0.6)',
    textPrimary: '#f8fafc', // slate-50
    textSecondary: '#cbd5e1', // slate-300
    textMuted: '#64748b', // slate-500
  }
};

export const spacing = {
  none: '0px',
  xs: '4px',    // 0.25rem (4)
  sm: '8px',    // 0.5rem (8)
  md: '12px',   // 0.75rem (12)
  lg: '16px',   // 1rem (16)
  xl: '24px',   // 1.5rem (24)
  xxl: '32px',  // 2rem (32)
  '3xl': '40px', // 2.5rem (40)
  '4xl': '48px', // 3rem (48)
  '5xl': '64px', // 4rem (64)
  '6xl': '96px', // 6rem (96)
};

export const radius = {
  none: '0px',
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  pill: '9999px',
};

export const shadows = {
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  glass: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
};

export const typography = {
  fontFamily: {
    sans: "'Montserrat', Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  fontSize: {
    12: '0.75rem',   // 12px
    14: '0.875rem',  // 14px
    16: '1rem',      // 16px
    18: '1.125rem',  // 18px
    20: '1.25rem',   // 20px
    24: '1.5rem',    // 24px
    30: '1.875rem',  // 30px
    36: '2.25rem',   // 36px
    48: '3rem',      // 48px
    64: '4.5rem',    // 64px
  },
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  }
};

export const transitions = {
  duration: {
    fast: '100ms',
    normal: '200ms',
    slow: '300ms',
    slowest: '500ms',
  },
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  }
};

export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
  toast: 1700,
};

// ============================================================================
// WCAG 2.2 AA BRAND-COLOR CONTRAST UTILITIES
// ============================================================================
// This product is white-label per tenant: `useSessionStore.setBrandColor` and
// `brandColor.controller.ts` let each tenant pick an arbitrary hex color for `--brand-color`,
// which `bg-brand` / `text-brand` then consume everywhere. A hardcoded `text-white` on `bg-brand`
// (or `text-brand` on a light `bg-brand-50` tint) silently fails WCAG contrast the moment a tenant
// picks a light brand color (e.g. a pastel) — this is the single most common contrast bug in a
// white-label design system. The helpers below compute contrast at render time instead of
// assuming a fixed palette.

const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/;

/** Parses a `#rrggbb` (or `rrggbb`) hex color into 0-255 RGB channels. Returns null if malformed. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = HEX_COLOR_RE.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.substring(0, 2), 16),
    g: parseInt(value.substring(2, 4), 16),
    b: parseInt(value.substring(4, 6), 16),
  };
}

/** WCAG relative luminance (0 = black, 1 = white) for an sRGB channel in the 0-255 range. */
function channelLuminance(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a `#rrggbb` color. Falls back to mid-gray luminance if malformed. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

/** WCAG contrast ratio (1:1 to 21:1) between two `#rrggbb` colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks pure white or pure black text for a *solid* background of `brandHex` (e.g. a primary
 * button, an avatar, a filled icon chip). For any background lightness, one of
 * {white-on-bg, black-on-bg} always reaches a contrast ratio of at least ~4.58:1 — the two curves
 * cross exactly there — so this is a mathematically guaranteed WCAG AA pass (4.5:1 normal text,
 * 3:1 large text) regardless of which color a tenant picks, without needing per-color tuning.
 */
export function getAccessibleTextOnBrand(brandHex: string | null | undefined): '#ffffff' | '#000000' {
  if (!brandHex || !hexToRgb(brandHex)) return '#ffffff';
  const whiteContrast = contrastRatio('#ffffff', brandHex);
  const blackContrast = contrastRatio('#000000', brandHex);
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  h /= 6;
  return { h, s, l };
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgbChannel(p, q, h + 1 / 3);
    g = hueToRgbChannel(p, q, h);
    b = hueToRgbChannel(p, q, h - 1 / 3);
  }
  const toHex = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Returns a hue-preserving variant of `brandHex` that reaches at least `minRatio` contrast
 * against `surfaceHex` — for *text* drawn directly on a page/card surface, or on a light/dark
 * tint of the brand color (badges, hints), rather than on a solid brand fill. Unlike
 * `getAccessibleTextOnBrand`, this keeps the tenant's hue recognizable (a lightly-darkened /
 * lightened version of their brand color) instead of collapsing to plain black/white, at the cost
 * of needing an explicit search since no single closed-form guarantee applies here. Falls back to
 * `brandHex` unchanged if the color is malformed, and stops (best-effort) if the ratio still can't
 * be met at the lightness extreme (a same-hue color always converges to near-black or near-white).
 */
export function getAccessibleBrandForeground(
  brandHex: string | null | undefined,
  surfaceHex: string,
  minRatio = 4.5
): string {
  if (!brandHex || !hexToRgb(brandHex)) return brandHex ?? '#000000';
  if (contrastRatio(brandHex, surfaceHex) >= minRatio) return brandHex;

  const hsl = hexToHsl(brandHex);
  if (!hsl) return brandHex;

  const surfaceIsLight = relativeLuminance(surfaceHex) > 0.5;
  // Light surface -> darken (walk lightness toward 0). Dark surface -> lighten (toward 1).
  let lo = surfaceIsLight ? 0 : hsl.l;
  let hi = surfaceIsLight ? hsl.l : 1;
  let best = hslToHex(hsl.h, hsl.s, surfaceIsLight ? 0 : 1);

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToHex(hsl.h, hsl.s, mid);
    if (contrastRatio(candidate, surfaceHex) >= minRatio) {
      best = candidate;
      if (surfaceIsLight) lo = mid; else hi = mid;
    } else if (surfaceIsLight) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}
