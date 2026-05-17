import { useEffect, useState } from 'react';
import { useTable } from 'spacetimedb/react';

/**
 * Module-level latch shared across ALL component instances.
 * Maps each table descriptor to whether a subscription snapshot has ever been
 * received.  Once any component sees `subscribeApplied === true` for a table,
 * every future component that mounts for the same table gets `ready: true`
 * immediately — no loading flash during navigation.
 */
const tableReadyLatch = new WeakMap<object, boolean>();

/**
 * Wraps useTable with a globally-latched ready flag.
 *
 * SpacetimeDB's `subscribeApplied` can temporarily flicker to `false` when the
 * server re-evaluates subscriptions (e.g. when another webapp connects/inserts
 * rows). Using the raw flag as a "loading" gate causes innocent bystander
 * webapps to flash a "Loading…" screen.
 *
 * This hook latches `ready` to `true` once the first subscription snapshot
 * arrives and never lets it go back to `false` — even across component
 * unmount/mount cycles — which is the correct UX behaviour for navigation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useReadyTable(tableQuery: any): [any[], boolean] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = useTable(tableQuery) as [any[], boolean];
  const rows = result[0];
  const subscribeApplied = result[1];

  // Initialise from the global latch so a remounting screen gets `true`
  // immediately if the subscription already fired once.
  const [ready, setReady] = useState(() => tableReadyLatch.get(tableQuery) ?? false);

  useEffect(() => {
    if (subscribeApplied && !tableReadyLatch.get(tableQuery)) {
      tableReadyLatch.set(tableQuery, true);
      setReady(true);
    }
  }, [subscribeApplied, tableQuery]);

  return [rows, ready];
}
