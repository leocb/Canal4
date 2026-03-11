import { useSpacetimeDB } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { useReadyTable } from './useReadyTable';

export function useAuth() {
  const { isActive, identity } = useSpacetimeDB();
  const [users, usersReady] = useReadyTable(tables.User);
  const [identities, identitiesReady] = useReadyTable(tables.UserIdentity);

  const isReady = isActive && usersReady && identitiesReady;

  if (!isActive || !identity) {
    return { user: null, isLoggedIn: false, identity: null, connected: false, isReady: !!isActive && isReady };
  }

  const userIdentity = identities.find((i: any) => i.identity.toHexString() === identity.toHexString());
  const user = userIdentity ? users.find((u: any) => u.userId === userIdentity.userId) : null;
  return { user: user || null, isLoggedIn: !!user, identity, connected: isActive, isReady };
}
