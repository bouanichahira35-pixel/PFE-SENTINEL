import { useEffect, useState } from 'react';

export default function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpointPx;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = `(max-width: ${Number(breakpointPx) || 640}px)`;
    const mql = window.matchMedia ? window.matchMedia(query) : null;

    const onChange = () => {
      setIsMobile(window.innerWidth <= breakpointPx);
    };

    if (mql && typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      onChange();
      return () => mql.removeEventListener('change', onChange);
    }

    window.addEventListener('resize', onChange);
    onChange();
    return () => window.removeEventListener('resize', onChange);
  }, [breakpointPx]);

  return Boolean(isMobile);
}

