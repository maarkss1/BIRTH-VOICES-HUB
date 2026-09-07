import { useEffect, useState } from 'react';

// ============================================================================
// REDUCED-MOTION DETECTION FOR JS-DRIVEN ANIMATIONS
// ============================================================================
// `index.css` already neutralizes CSS `animation`/`transition` under
// `@media (prefers-reduced-motion: reduce)` and under `html[data-reduced-motion="true"]` (the
// in-app toggle on Preferences, applied via `document.documentElement.dataset.reducedMotion`).
// Neither mechanism touches `motion/react` (Framer Motion) animations though: those are driven by
// JS on every rAF tick, not by the CSS `transition`/`animation` properties, so a spring/scale/slide
// on `Modal`, `Tabs`, or `ToastContainer` would keep animating even for a user who has explicitly
// asked for reduced motion (OS-level or in-app). This hook mirrors both signals so design-system
// components can drop straight to their end state instead.
function computeReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const osPrefersReduced = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const appPrefersReduced = document.documentElement.dataset.reducedMotion === 'true';
  return osPrefersReduced || appPrefersReduced;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => computeReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const update = () => setReduced(computeReducedMotion());
    update();

    // jsdom (unit tests) doesn't implement matchMedia — degrade to the `data-reduced-motion`
    // signal only rather than throwing.
    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    mediaQuery?.addEventListener('change', update);

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });

    return () => {
      mediaQuery?.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  return reduced;
}
