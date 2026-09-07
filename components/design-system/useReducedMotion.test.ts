// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePrefersReducedMotion } from './useReducedMotion';

afterEach(() => {
  delete document.documentElement.dataset.reducedMotion;
  vi.unstubAllGlobals();
});

describe('usePrefersReducedMotion', () => {
  it('is false by default (no OS preference, no in-app toggle)', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('does not throw in an environment without window.matchMedia (e.g. jsdom-lite/SSR-ish setups)', () => {
    const original = window.matchMedia;
    // @ts-expect-error -- simulate an environment where matchMedia is unavailable
    delete window.matchMedia;

    expect(() => renderHook(() => usePrefersReducedMotion())).not.toThrow();

    window.matchMedia = original;
  });

  it('reflects the in-app `data-reduced-motion` toggle set by Preferences', async () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      document.documentElement.dataset.reducedMotion = 'true';
    });

    await waitFor(() => expect(result.current).toBe(true));
  });
});
