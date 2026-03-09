import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';

export function useAuth() {
  const { isActive, identity } = useSpacetimeDB();
  const [rows] = useTable(tables.User);

  if (!isActive || !identity) {
    return { user: null, isLoggedIn: false, identity: null, connected: false };
  }

  const user = rows.find(u => u.identity.toHexString() === identity.toHexString());
  return { user: user || null, isLoggedIn: !!user, identity, connected: isActive };
}
