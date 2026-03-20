import { useMemo, useEffect, useState, createContext, useContext, useCallback, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index";

export type ConnectivityStatus = "online" | "offline" | "error";

interface ConnectivityContextType {
  status: ConnectivityStatus;
  reconnect: () => void;
  nextRetryIn: number;
  error: { message: string, stack?: string } | undefined;
  heartbeatError: string | undefined;
  setHeartbeatError: (err: string | undefined) => void;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error("useConnectivity must be used within a SpacetimeDBProvider");
  }
  return context;
};

// Legacy compatibility
export const useSpacetimeError = () => {
  const { error } = useConnectivity();
  return { lastError: error ? new Error(error.message) : null, setLastError: () => {} };
};

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<ConnectivityStatus>("offline");
  const [error, setError] = useState<{ message: string, stack?: string } | undefined>(undefined);
  const [heartbeatError, setHeartbeatError] = useState<string | undefined>(undefined);
  const [nextRetryIn, setNextRetryIn] = useState<number>(15);
  const [reconnectKey, setReconnectKey] = useState(0);

  const getSanitized = (key: string) => {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined' || val === 'null' || val === '') return undefined;
    return val;
  };

  const [activeToken, setActiveToken] = useState<string | undefined>(getSanitized("auth_token"));
  const [isSyncingMain, setIsSyncingMain] = useState(true);

  // Unified settings source
  const stUri = getSanitized("spacetime_uri") || "ws://localhost:3000";
  const stDb = getSanitized("spacetime_db") || "canal4-dev";

  useEffect(() => {
    // Pull token from Main as the source of truth
    // @ts-ignore
    if (window.api?.getToken) {
      // @ts-ignore
      window.api.getToken().then(mainToken => {
        const sanitizedMain = (mainToken === 'undefined' || mainToken === 'null' || !mainToken) ? undefined : mainToken;
        const currentLocal = getSanitized("auth_token");
        if (sanitizedMain !== currentLocal) {
          if (sanitizedMain) localStorage.setItem("auth_token", sanitizedMain);
          else localStorage.removeItem("auth_token");
          setActiveToken(sanitizedMain);
        }
        setIsSyncingMain(false);
      }).catch(() => setIsSyncingMain(false));
    } else {
      setIsSyncingMain(false);
    }

    // @ts-ignore
    if (window.api?.onTokenUpdated) {
      // @ts-ignore
      window.api.onTokenUpdated((newToken: string) => {
        const sanitizedNew = (newToken === 'undefined' || newToken === 'null' || !newToken) ? undefined : newToken;
        setActiveToken(prev => {
          if (sanitizedNew !== prev) {
            if (sanitizedNew) localStorage.setItem("auth_token", sanitizedNew);
            else localStorage.removeItem("auth_token");
            return sanitizedNew;
          }
          return prev;
        });
      });
    }
  }, []);

  const reconnect = useCallback(() => {
    console.log("[Provider] Reconnection triggered via context");
    setStatus("offline");
    setError(undefined);
    setHeartbeatError(undefined);
    setNextRetryIn(15);
    setReconnectKey(prev => prev + 1);
  }, []);

  const builder = useMemo(() => {
    // Postpone until we've at least tried to sync with main process file
    if (isSyncingMain) return null;

    return DbConnection.builder()
      .withUri(stUri)
      .withDatabaseName(stDb)
      .withToken(activeToken)
      .onConnect((connection, _identity, token) => {
        setStatus("online");
        setError(undefined);
        const currentLocal = localStorage.getItem("auth_token");

        // Only trigger a persistence/broadcast if it's actually new
        if (token && token !== currentLocal) {
          localStorage.setItem("auth_token", token);
          // @ts-ignore
          if (window.api?.setToken) window.api.setToken(token);
        }

        const sub = connection.subscriptionBuilder();
        sub.subscribe([
          "SELECT * FROM User",
          "SELECT * FROM Venue",
          "SELECT * FROM Channel",
          "SELECT * FROM VenueMember",
          "SELECT * FROM ChannelMemberRole",
          "SELECT * FROM MessageTemplate",
          "SELECT * FROM Message",
          "SELECT * FROM NotificationFilter",
          "SELECT * FROM DisplayDevice",
          "SELECT * FROM DisplayPairingPin",
          "SELECT * FROM MessageDeliveryStatus",
          "SELECT * FROM UserIdentity"
        ]);
      })
      .onConnectError((_ctx, err: any) => {
        setStatus("error");
        const errorStr = String(err);
        setError({ message: errorStr, stack: err?.stack });

        const isAuthError =
          errorStr.includes('403') ||
          errorStr.includes('401') ||
          errorStr.includes('Unauthorized') ||
          errorStr.includes('Failed to verify token');

        if (activeToken && isAuthError) {
          localStorage.removeItem("auth_token");
          setActiveToken(undefined);
          // @ts-ignore
          if (window.api?.setToken) {
            window.api.setToken('');
          }
        }
      })
      .onDisconnect(() => {
        setStatus("offline");
      });
  }, [activeToken, stUri, stDb, isSyncingMain, reconnectKey]);

  const providerKey = `${activeToken || 'anon'}-${stUri}-${stDb}-${reconnectKey}`;

  return (
    <ConnectivityContext.Provider value={{ status, reconnect, nextRetryIn, error, heartbeatError, setHeartbeatError }}>
      {builder ? (
        <Provider key={providerKey} connectionBuilder={builder}>
          {children}
        </Provider>
      ) : (
        <div style={{ color: '#94A3B8', fontSize: '12px', padding: '10px' }}>Syncing Identity...</div>
      )}
    </ConnectivityContext.Provider>
  );
};
