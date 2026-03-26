import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for keyboard-wedge barcode scanners.
 * Captures rapid sequential keystrokes (< 50ms apart) ending with Enter.
 * Fires callback with the scanned string when barcode detected (8+ chars).
 */
export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTime.current;
      lastKeyTime.current = now;

      // If too much time passed, reset buffer
      if (timeSinceLastKey > 80) {
        buffer.current = '';
      }

      if (e.key === 'Enter') {
        if (buffer.current.length >= 8) {
          e.preventDefault();
          onScan(buffer.current);
        }
        buffer.current = '';
        return;
      }

      // Only accumulate printable single chars
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't capture if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          // Still accumulate for scanner detection (scanners are fast)
          if (timeSinceLastKey < 50) {
            buffer.current += e.key;
          } else {
            buffer.current = '';
          }
          return;
        }
        buffer.current += e.key;
      }
    },
    [onScan],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [handleKeyDown]);
}
