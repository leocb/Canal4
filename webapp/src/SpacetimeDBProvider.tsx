import { useMemo, useState, useCallback, useContext, createContext, type ReactNode } from "react";
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

  const token = localStorage.getItem("auth_token") || undefined;

  // Prefer window.CONFIG (runtime injected by Nginx) over import.meta.env (build-time)
  const uri = (window as any).CONFIG?.SPACETIMEDB_URI || import.meta.env.VITE_SPACETIMEDB_URI || import.meta.env.VITE_SPACETIMEDB_URI_DEV || "http://localhost:3000";
  const DB_NAME = (window as any).CONFIG?.SPACETIMEDB_NAME || import.meta.env.VITE_SPACETIMEDB_NAME || import.meta.env.VITE_SPACETIMEDB_MODULE_NAME || "canal4";

  // Ensure URI doesn't have double slashes if it ends with one
  let resolvedUri = uri.endsWith("/") ? uri.slice(0, -1) : uri;

  const reconnect = useCallback(() => {
    console.log("Reconnection triggered manually via context");
    setStatus("offline");
    setError(undefined);
    setReconnectKey(prev => prev + 1);
  }, []);

  const builder = useMemo(() => {
    return DbConnection.builder()
      .withUri(resolvedUri)
      .withDatabaseName(DB_NAME)
      .withToken(token)
      .onConnect((connection, _identity, token) => {
        setStatus("online");
        setError(undefined);
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
          console.error("Critical failure during subscription setup:", subErr);
        }
      })
      .onConnectError((_ctx, err: any) => {
        setStatus("error");
        setError(err?.message || String(err));
        console.error("SpacetimeDB Connection Failed. Details:", err);
      })
      .onDisconnect((_ctx, _err) => {
        setStatus("offline");
      });
  }, [token, resolvedUri, DB_NAME, reconnectKey]);

  return (
    <ConnectivityContext.Provider value={{ status, error, reconnect }}>
      <Provider key={reconnectKey} connectionBuilder={builder}>
        {children}
      </Provider>
    </ConnectivityContext.Provider>
  );
};
