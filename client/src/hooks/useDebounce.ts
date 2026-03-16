import { useState, useEffect } from 'react';

/**
 * Debounce a value by the given delay (ms).
 * Any search input should use this before firing API queries.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
