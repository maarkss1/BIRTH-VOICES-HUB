import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  getAccessibleBrandForeground,
  getAccessibleTextOnBrand,
  hexToRgb,
  relativeLuminance,
} from './tokens';

// This product is white-label per tenant (see brandColor.controller.ts / useSessionStore): any
// hex color a tenant picks flows straight into `--brand-color` and is used as a solid background
// (buttons, avatars) or a light/dark tint (badges). These tests validate contrast both for the
// platform's own default brand color AND for a non-default tenant color, per the Onda 3 minimum
// test requirement ("contraste validado para pelo menos uma cor de marca de tenant não-padrão,
// além da padrão") — and specifically for a pastel color, the case that breaks a naive
// `text-white on bg-brand` assumption.
const DEFAULT_BRAND = '#ff5618'; // Atlas orange — the platform default.
const NON_DEFAULT_TENANT_BRAND = '#fef08a'; // a very light pastel yellow a tenant might choose.
const MID_TENANT_BRAND = '#7c3aed'; // "Roxo Imperial" — one of the CommandPalette quick presets.

describe('hexToRgb / relativeLuminance / contrastRatio', () => {
  it('parses a well-formed hex color', () => {
    expect(hexToRgb('#ff5618')).toEqual({ r: 255, g: 86, b: 24 });
  });

  it('returns null for a malformed color instead of throwing', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('#fff')).toBeNull(); // 3-digit shorthand intentionally unsupported
  });

  it('rates pure black and pure white at opposite luminance extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  it('gives black-on-white the maximum 21:1 contrast ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('gives a color no contrast against itself', () => {
    expect(contrastRatio('#ff5618', '#ff5618')).toBeCloseTo(1, 5);
  });
});

describe('getAccessibleTextOnBrand (solid bg-brand fill)', () => {
  it.each([
    ['default brand orange', DEFAULT_BRAND],
    ['non-default pastel tenant brand', NON_DEFAULT_TENANT_BRAND],
    ['non-default mid-tone tenant brand', MID_TENANT_BRAND],
    ['near-white tenant brand', '#fefefe'],
    ['near-black tenant brand', '#0a0a0a'],
  ])('reaches WCAG AA (>=4.5:1) for %s (%s)', (_label, hex) => {
    const textColor = getAccessibleTextOnBrand(hex);
    expect(['#ffffff', '#000000']).toContain(textColor);
    expect(contrastRatio(textColor, hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back to white for a missing/invalid color instead of throwing', () => {
    expect(getAccessibleTextOnBrand(null)).toBe('#ffffff');
    expect(getAccessibleTextOnBrand(undefined)).toBe('#ffffff');
    expect(getAccessibleTextOnBrand('not-a-color')).toBe('#ffffff');
  });
});

describe('getAccessibleBrandForeground (brand text on a tint/surface)', () => {
  const LIGHT_SURFACE = '#ffffff';
  const DARK_SURFACE = '#242322';

  it.each([
    ['default brand orange', DEFAULT_BRAND],
    ['non-default pastel tenant brand', NON_DEFAULT_TENANT_BRAND],
    ['non-default mid-tone tenant brand', MID_TENANT_BRAND],
  ])('reaches WCAG AA (>=4.5:1) on a light surface for %s (%s)', (_label, hex) => {
    const fg = getAccessibleBrandForeground(hex, LIGHT_SURFACE);
    expect(contrastRatio(fg, LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['default brand orange', DEFAULT_BRAND],
    ['non-default pastel tenant brand', NON_DEFAULT_TENANT_BRAND],
    ['non-default mid-tone tenant brand', MID_TENANT_BRAND],
  ])('reaches WCAG AA (>=4.5:1) on a dark surface for %s (%s)', (_label, hex) => {
    const fg = getAccessibleBrandForeground(hex, DARK_SURFACE);
    expect(contrastRatio(fg, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it('returns the color unchanged when it already passes contrast', () => {
    // A very dark brand color already reads fine on a white surface.
    const alreadyPassing = '#1a1a1a';
    expect(getAccessibleBrandForeground(alreadyPassing, LIGHT_SURFACE)).toBe(alreadyPassing);
  });

  it('falls back to the original value for a malformed color instead of throwing', () => {
    expect(getAccessibleBrandForeground('nope', LIGHT_SURFACE)).toBe('nope');
    expect(getAccessibleBrandForeground(null, LIGHT_SURFACE)).toBe('#000000');
  });
});
