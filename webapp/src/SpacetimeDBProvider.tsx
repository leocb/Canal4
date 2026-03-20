import { useMemo, useEffect, useRef, useState, useCallback, useContext, createContext, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index.ts";

export type ConnectivityStatus = "online" | "offline" | "error";

interface ConnectivityContextType {
  status: ConnectivityStatus;
  reconnect: () => void;
  error: string | undefined;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error("useConnectivity must be used within a SpacetimeDBProvider");
  }
  return context;
};

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<ConnectivityStatus>("offline");
  const [error, setError] = useState<string | undefined>(undefined);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [activeRetryCount, setActiveRetryCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentBuilderRef = useRef<any>(null);

  const token = localStorage.getItem("auth_token") || undefined;

  // Prefer window.CONFIG (runtime injected by Nginx) over import.meta.env (build-time)
  const uri = (window as any).CONFIG?.SPACETIMEDB_URI || import.meta.env.VITE_SPACETIMEDB_URI || import.meta.env.VITE_SPACETIMEDB_URI_DEV || "http://localhost:3000";
  const DB_NAME = (window as any).CONFIG?.SPACETIMEDB_NAME || import.meta.env.VITE_SPACETIMEDB_NAME || import.meta.env.VITE_SPACETIMEDB_MODULE_NAME || "canal4";

  // Ensure URI doesn't have double slashes if it ends with one
  let resolvedUri = uri.endsWith("/") ? uri.slice(0, -1) : uri;

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;

    setRetryCount(prev => {
      const nextCount = prev + 1;
      const delay = 10000; // Fixed 10s delay as requested
      
      console.log(`[STDB] Scheduling retry #${nextCount} in ${delay}ms...`);
      
      retryTimerRef.current = setTimeout(() => {
        console.log(`[STDB] Executing retry #${nextCount}...`);
        retryTimerRef.current = null;
        setActiveRetryCount(nextCount);
      }, delay);
      
      return nextCount;
    });
  }, []);

  const reconnect = useCallback(() => {
    console.log("[STDB] Reconnection triggered manually via context");
    setStatus("offline");
    setError(undefined);
    setRetryCount(0);
    setActiveRetryCount(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setReconnectKey(prev => prev + 1);
  }, []);

  const builder = useMemo(() => {
    const url = new URL(resolvedUri);
    url.searchParams.set('reconnectKey', reconnectKey.toString());
    url.searchParams.set('retry', activeRetryCount.toString());
    const finalUri = url.toString();

    const b = DbConnection.builder()
      .withUri(finalUri)
      .withDatabaseName(DB_NAME)
      .withToken(token)
      .onConnect((connection, _identity, token) => {
        if (b !== currentBuilderRef.current) return;

        console.log("[STDB] Connected successfully.");
        setStatus("online");
        setError(undefined);
        setRetryCount(0);
        setActiveRetryCount(0);
        localStorage.setItem("auth_token", token);
        
        try {
          const sub = connection.subscriptionBuilder();
          sub.subscribe([
            "SELECT * FROM User",
            "SELECT * FROM UserIdentity",
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
            "SELECT * FROM VenueInviteToken"
          ]);
        } catch (subErr) {
          console.error("[STDB] Critical failure during subscription setup:", subErr);
        }
      })
      .onConnectError((_ctx, err: any) => {
        if (b !== currentBuilderRef.current) return;

        console.error("[STDB] Connection error:", err);
        setStatus("error");
        setError(err?.message || String(err));
        scheduleRetry();
      })
      .onDisconnect((_ctx, _err) => {
        if (b !== currentBuilderRef.current) {
          console.debug("[STDB] Ignoring disconnect from old builder.");
          return;
        }

        console.warn("[STDB] Disconnected.");
        setStatus("offline");
        scheduleRetry();
      });

    return b;
  }, [token, resolvedUri, DB_NAME, reconnectKey, activeRetryCount, scheduleRetry]);

  useEffect(() => {
    currentBuilderRef.current = builder;
  }, [builder]);

  return (
    <ConnectivityContext.Provider value={{ status, error, reconnect }}>
      <Provider key={`${reconnectKey}-${activeRetryCount}`} connectionBuilder={builder}>
        {children}
      </Provider>
    </ConnectivityContext.Provider>
  );
};
