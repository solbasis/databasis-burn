import { useEffect, useState } from 'react';

// Tiny theme-toggle button. Reads + writes via the global window.BasisTheme
// API exposed by /theme.js (loaded synchronously in index.html). The actual
// theme swap is a single attribute set on <html>; tokens.css does the rest.
//
// We subscribe to BasisTheme.onChange so this component also reflects
// cross-tab theme changes (storage event) and OS-level prefers-color-scheme
// flips that happen while the page is open.
export function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    (typeof window !== 'undefined' && window.BasisTheme?.get?.()) || 'dark'
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.BasisTheme) return;
    return window.BasisTheme.onChange(setTheme);
  }, []);

  const handleClick = () => {
    if (typeof window === 'undefined' || !window.BasisTheme) return;
    window.BasisTheme.toggle();
  };

  // Show the icon for the OPPOSITE theme — clicking switches to that.
  // Dark active → show ☼ (will switch to light).  Light active → show ☾.
  const targetIcon = theme === 'dark' ? '☼' : '☾';
  const ariaLabel  = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span aria-hidden="true">{targetIcon}</span>
    </button>
  );
}
