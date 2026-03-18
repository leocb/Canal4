import { useMemo, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index.ts";

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem("auth_token") || undefined;

  // Prefer window.CONFIG (runtime injected by Nginx) over import.meta.env (build-time)
  const DB_NAME: string = (window as any).CONFIG?.SPACETIMEDB_NAME || import.meta.env.VITE_SPACETIMEDB_NAME;
  const SPACETIMEDB_URI: string = (window as any).CONFIG?.SPACETIMEDB_URI || import.meta.env.VITE_SPACETIMEDB_URI || import.meta.env.VITE_SPACETIMEDB_URI_DEV;

  if (!DB_NAME) {
    throw new Error("Missing SPACETIMEDB_NAME in environment configuration. Please check your .env file.");
  }

  if (!SPACETIMEDB_URI) {
    throw new Error("Missing SPACETIMEDB_URI in environment configuration. Please check your .env file.");
  }

  // If accessed from a phone/other device on LAN in dev, swap localhost for the actual IP
  const resolvedUri = (SPACETIMEDB_URI.includes('localhost') || SPACETIMEDB_URI.includes('127.0.0.1')) &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
      ? SPACETIMEDB_URI.replace(/(localhost|127\.0\.0\.1)/, window.location.hostname)
      : SPACETIMEDB_URI;

  const builder = useMemo(() => {
    return DbConnection.builder()
      .withUri(resolvedUri)
      .withDatabaseName(DB_NAME)
      .withToken(token)
      .onConnect((connection, _identity, token) => {
        console.log("Connected to SpacetimeDB");
        localStorage.setItem("auth_token", token);
        
        // Simple prototype: subscribe to all tables 
        const sub = connection.subscriptionBuilder();
        sub.onApplied(() => {
            console.log("Subscription applied successfully.");
        });

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
      })
      .onConnectError((_ctx, err: unknown) => {
        console.error("SpacetimeDB Connection Error:", err);
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

