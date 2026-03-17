import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';

/**
 * Wraps useTable with a latched ready flag.
 *
 * SpacetimeDB's `subscribeApplied` can temporarily flicker to `false` when the
 * server re-evaluates subscriptions (e.g. when another webapp connects/inserts
 * rows). Using the raw flag as a "loading" gate causes innocent bystander
 * webapps to flash a "Loading…" screen.
 *
 * This hook latches `ready` to `true` once the first subscription snapshot
 * arrives and never lets it go back to `false` for the lifetime of the
 * component, which is the correct UX behaviour.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReadyTable(tableQuery: any): [any[], boolean] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = useTable(tableQuery) as [any[], boolean];
  const rows = result[0];
  const subscribeApplied = result[1];

  const latchRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (subscribeApplied && !latchRef.current) {
      latchRef.current = true;
      setReady(true);
    }
  }, [subscribeApplied]);

  return [rows, ready];
}
