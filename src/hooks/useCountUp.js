import { useEffect, useRef, useState } from 'react';

// Smoothly animates from the previously-rendered value up (or down) to `target`
// over `duration` ms. Uses an ease-out curve so big jumps feel snappy at the
// start and settle gracefully — way more premium than the number popping in.
//
// First-render behaviour: animates from 0 up to the initial target so the user
// sees the count "boot in" on page load. After that, animates only the *delta*
// between renders, which means a +1 burn ticks gracefully, not from 0 again.
//
// Falls back to a no-op (returns target unchanged) when the user has
// prefers-reduced-motion enabled — avoids strobing the number for a11y users.
export function useCountUp(target, { duration = 900 } = {}) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setValue(target);
      return;
    }

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(target)) {
      setValue(target);
      fromRef.current = target;
      return;
    }

    cancelAnimationFrame(rafRef.current);
    fromRef.current = value;
    startRef.current = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      // ease-out cubic — snappy start, soft landing
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else       setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
