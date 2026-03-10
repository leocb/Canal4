import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';

export function useAuth() {
  const { isActive, identity } = useSpacetimeDB();
  const [users] = useTable(tables.User);
  const [identities] = useTable(tables.UserIdentity);

  if (!isActive || !identity) {
    return { user: null, isLoggedIn: false, identity: null, connected: false };
  }

  const userIdentity = identities.find((i: any) => i.identity.toHexString() === identity.toHexString());
  const user = userIdentity ? users.find((u: any) => u.userId === userIdentity.userId) : null;
  return { user: user || null, isLoggedIn: !!user, identity, connected: isActive };
}
