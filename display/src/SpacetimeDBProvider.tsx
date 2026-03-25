import { useMemo, useEffect, useRef, useState, createContext, useContext, useCallback, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection, tables } from "./module_bindings/index";

export type ConnectivityStatus = "online" | "offline" | "error";

interface ConnectivityContextType {
  status: ConnectivityStatus;
  reconnect: () => void;
  nextRetryIn: number;
  error: { message: string, stack?: string } | undefined;
  heartbeatError: string | undefined;
  setHeartbeatError: (err: string | undefined) => void;
  stUri: string;
  setStUri: (u: string) => void;
  stDb: string;
  setStDb: (db: string) => void;
  hasConnectedOnce: boolean;
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
  const [nextRetryIn, setNextRetryIn] = useState<number>(0);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentBuilderRef = useRef<any>(null);

  const getSanitized = (key: string) => {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined' || val === 'null' || val === '') return undefined;
    return val;
  };

  const [activeToken, setActiveToken] = useState<string | undefined>(getSanitized("auth_token"));
  const [isSyncingMain, setIsSyncingMain] = useState(true);

  const [stUri, setStUri] = useState<string>(getSanitized("spacetime_uri") || "ws://localhost:3000");
  const [stDb, setStDb] = useState<string>(getSanitized("spacetime_db") || "canal4-dev");
  
  // Wrap setters to persist to localStorage
  const updateStUri = useCallback((u: string) => {
    localStorage.setItem("spacetime_uri", u);
    setStUri(u);
  }, []);

  const updateStDb = useCallback((db: string) => {
    localStorage.setItem("spacetime_db", db);
    setStDb(db);
  }, []);

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

  const hasConnectedOnceRef = useRef(false);
  useEffect(() => {
    hasConnectedOnceRef.current = hasConnectedOnce;
  }, [hasConnectedOnce]);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    
    // Only retry if it was connected previously as requested
    if (!hasConnectedOnceRef.current) {
      console.log("[STDB] Skipping auto-retry: App has never connected successfully.");
      return;
    }

    const nextCount = retryAttemptRef.current + 1;
    retryAttemptRef.current = nextCount;
    const delay = 10000; // Fixed 10s delay as requested
    
    setNextRetryIn(10);
    console.log(`[STDB] Scheduling retry #${nextCount} in ${delay}ms...`);
    
    retryTimerRef.current = setTimeout(() => {
      console.log(`[STDB] Executing retry #${nextCount}...`);
      retryTimerRef.current = null;
      // Changing reconnectKey is the stable way to trigger a NEW builder
      setReconnectKey(prev => prev + 1);
    }, delay);
  }, []);

  // Handle countdown ticking
  useEffect(() => {
    if (status === 'online') {
      setNextRetryIn(0);
      return;
    }

    if (nextRetryIn > 0) {
      const interval = setInterval(() => {
        setNextRetryIn(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [status, nextRetryIn]);
  const reconnect = useCallback(() => {
    console.log("[STDB] Reconnection triggered manually via context");
    setStatus("offline");
    setError(undefined);
    setHeartbeatError(undefined);
    setNextRetryIn(0);
    retryAttemptRef.current = 0;
    // Note: Manual reconnect doesn't reset hasConnectedOnce, potentially allowing auto-retries 
    // to resume if they were previously active.
    if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
    }
    setReconnectKey(prev => prev + 1);
  }, []);

  const builder = useMemo(() => {
    // Postpone until we've at least tried to sync with main process file
    if (isSyncingMain) return null;

    // We use reconnectKey and the current retry attempt to ensure a unique URI
    // but we don't depend on activeRetryCount directly to avoid re-memoizing
    // and breaking the connection session during the transition to 'online'.
    const url = new URL(stUri);
    url.searchParams.set("reconnectKey", reconnectKey.toString());
    url.searchParams.set("retry", retryAttemptRef.current.toString());
    const finalUri = url.toString();

    console.log(`[STDB] Creating new builder: ${finalUri}`);
    const b = DbConnection.builder()
      .withUri(finalUri)
      .withDatabaseName(stDb)
      .withToken(activeToken)
      .onConnect((connection, _identity, token) => {
        // Use the instance-captured builder 'b' for the check
        if (b !== currentBuilderRef.current) {
          console.warn("[STDB] onConnect fired for an abandoned builder. Ignoring.");
          return;
        }

        console.log("[STDB] SpacetimeDB Connected.");
        setStatus("online");
        setError(undefined);
        setHasConnectedOnce(true);
        
        // Reset retry counters
        retryAttemptRef.current = 0;
        setNextRetryIn(0);
        // DO NOT update activeRetryCount here as it would trigger a re-memoization 
        // of the builder we are currently using, potentially breaking currentBuilderRef check.
        
        const currentLocal = localStorage.getItem("auth_token");
        if (token && token !== currentLocal) {
          localStorage.setItem("auth_token", token);
          setActiveToken(token);
          // @ts-ignore
          if (window.api?.setToken) window.api.setToken(token);
        }

        const sub = connection.subscriptionBuilder();
        sub.subscribe([
          tables.UserView,
          tables.VenueView,
          tables.ChannelView,
          tables.VenueMemberView,
          tables.ChannelMemberRoleView,
          tables.MessageTemplateView,
          tables.MessageView,
          tables.NotificationFilterView,
          tables.DisplayDeviceView,
          tables.DisplayPairingPinView,
          tables.MessageDeliveryStatusView,
          tables.UserIdentitySelfView
        ]);
      })
      .onConnectError((_ctx, err: any) => {
        if (b !== currentBuilderRef.current) return;

        console.error("[STDB] SpacetimeDB connection error:", err);
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
          if (window.api?.setToken) {
            window.api.setToken('');
          }
        }
        
        scheduleRetry();
      })
      .onDisconnect(() => {
        if (b !== currentBuilderRef.current) {
          console.debug("[STDB] Ignoring disconnect from old builder.");
          return;
        }

        console.warn("[STDB] SpacetimeDB Disconnected.");
        setStatus("offline");
        scheduleRetry();
      });

    return b;
  }, [activeToken, stUri, stDb, isSyncingMain, reconnectKey, scheduleRetry]);

  useEffect(() => {
    currentBuilderRef.current = builder;
  }, [builder]);

  return (
    <ConnectivityContext.Provider value={{ 
      status, reconnect, nextRetryIn, error, heartbeatError, setHeartbeatError,
      stUri, setStUri: updateStUri, stDb, setStDb: updateStDb,
      hasConnectedOnce
    }}>
      {builder ? (
        <Provider connectionBuilder={builder}>
          {children}
        </Provider>
      ) : (
        <div style={{ color: '#94A3B8', fontSize: '12px', padding: '10px' }}>Syncing Identity...</div>
      )}
    </ConnectivityContext.Provider>
  );
};
