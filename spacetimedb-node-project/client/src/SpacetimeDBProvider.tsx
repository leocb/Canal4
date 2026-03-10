import { useMemo, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index.ts";

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem("auth_token") || undefined;
  
  const DB_NAME = import.meta.env.VITE_SPACETIMEDB_NAME;
  const URI_DEV = import.meta.env.VITE_SPACETIMEDB_URI_DEV;
  const URI_PROD = import.meta.env.VITE_SPACETIMEDB_URI_PROD;

  if (!DB_NAME) {
    throw new Error("Missing VITE_SPACETIMEDB_NAME in environment configuration. Please check your .env file.");
  }

  const SPACETIMEDB_URI = import.meta.env.DEV ? URI_DEV : URI_PROD;

  if (!SPACETIMEDB_URI) {
    throw new Error(`Missing SpacetimeDB URI for ${import.meta.env.DEV ? 'development' : 'production'} mode. Please check your .env file.`);
  }

  const builder = useMemo(() => {
    return DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
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
          "SELECT * FROM MessengerDevice",
          "SELECT * FROM MessengerPairingPin",
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

