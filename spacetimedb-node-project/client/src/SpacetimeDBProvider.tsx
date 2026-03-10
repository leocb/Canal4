import { useMemo, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index.ts";

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem("auth_token") || undefined;
  
  const builder = useMemo(() => {
    return DbConnection.builder()
      .withUri("wss://maincloud.spacetimedb.com")
      .withDatabaseName("spacetimedb-node-project-gybhi")
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

