import { useMemo, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index";

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  // Do NOT pass a stored token — if it was issued by a different server instance
  // (e.g. production vs local), the websocket-token exchange will fail with
  // "Failed to fetch". Start anonymous; a fresh token is saved by onConnect.
  const token = localStorage.getItem("auth_token") || undefined;

  const builder = useMemo(() => {
    // Normalize: 'localhost' can resolve to ::1 (IPv6) while SpacetimeDB
    // listens on 127.0.0.1 (IPv4), causing "Failed to fetch".
    const rawUri = localStorage.getItem("spacetime_uri") || "ws://127.0.0.1:3000";
    const stUri = rawUri.replace('://localhost', '://127.0.0.1');
    const stDb = localStorage.getItem("spacetime_db") || "spacetimedb-node-project-gybhi";

    return DbConnection.builder()
      .withUri(stUri)
      .withDatabaseName(stDb)
      .withToken(token)
      .onConnect((connection, _identity, token) => {
        console.log("Connected to SpacetimeDB");
        localStorage.setItem("auth_token", token);
        
        const sub = connection.subscriptionBuilder();
        sub.onApplied(() => {
            console.log("Subscription applied successfully.");
        });

        sub.subscribe([
          "SELECT * FROM User",
          "SELECT * FROM Venue",
          "SELECT * FROM Channel",
          "SELECT * FROM VenueMember",
          "SELECT * FROM ChannelMemberRole",
          "SELECT * FROM MessageTemplate",
          "SELECT * FROM Message",
          "SELECT * FROM NotificationFilter",
          "SELECT * FROM MessengerDevice",
          "SELECT * FROM MessengerPairingPin",
          "SELECT * FROM MessageDeliveryStatus"
        ]);
      })
      .onConnectError((_ctx, err: any) => {
        console.error("SpacetimeDB Connection Error:", err);
        // If we failed to fetch (likely a stale token vs fresh DB), clear token and retry
        if (token && (err?.message?.includes('fetch') || String(err).includes('fetch'))) {
          console.warn("Stale auth token detected, clearing and reloading...");
          localStorage.removeItem("auth_token");
          window.location.reload();
        }
      })
      .onDisconnect((_ctx, _err) => {
        console.log("Disconnected from SpacetimeDB");
      });
  }, [token]);

  return (
    <Provider connectionBuilder={builder}>
      {children}
    </Provider>
  );
};
