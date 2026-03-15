import { useMemo, useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { SpacetimeDBProvider as Provider } from "spacetimedb/react";
import { DbConnection } from "./module_bindings/index";

const ErrorContext = createContext<{ lastError: Error | null; setLastError: (e: Error | null) => void }>({
  lastError: null,
  setLastError: () => {}
});

export const useSpacetimeError = () => useContext(ErrorContext);

export const SpacetimeDBProvider = ({ children }: { children: ReactNode }) => {
  const [lastError, setLastError] = useState<Error | null>(null);
  
  const getSanitized = (key: string) => {
    const val = localStorage.getItem(key);
    if (!val || val === 'undefined' || val === 'null' || val === '') return undefined;
    return val;
  };

  const [activeToken, setActiveToken] = useState<string | undefined>(getSanitized("auth_token"));
  const [isSyncingMain, setIsSyncingMain] = useState(true);

  // Unified settings source
  const stUri = getSanitized("spacetime_uri") || "ws://localhost:3000";
  const stDb = getSanitized("spacetime_db") || "spacetimedb-node-project-gybhi";

  useEffect(() => {
    console.log("[SpacetimeDBProvider] Initial Mount. Local token:", activeToken ? "present" : "absent");
    
    // Pull token from Main as the source of truth
    // @ts-ignore
    if (window.api?.getToken) {
      // @ts-ignore
      window.api.getToken().then(mainToken => {
        const sanitizedMain = (mainToken === 'undefined' || mainToken === 'null' || !mainToken) ? undefined : mainToken;
        const currentLocal = getSanitized("auth_token");
        
        console.log("[SpacetimeDBProvider] Source of truth check. Main:", sanitizedMain ? "present" : "absent", "Local:", currentLocal ? "present" : "absent");
        
        if (sanitizedMain !== currentLocal) {
          console.log("[SpacetimeDBProvider] Updating local token to match Main process storage.");
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
             console.log("[SpacetimeDBProvider] Token refreshed from background update.");
             if (sanitizedNew) localStorage.setItem("auth_token", sanitizedNew);
             else localStorage.removeItem("auth_token");
             return sanitizedNew;
           }
           return prev;
        });
      });
    }
  }, []);

  const builder = useMemo(() => {
    // Postpone until we've at least tried to sync with main process file
    if (isSyncingMain) {
        console.log("[SpacetimeDBProvider] Postponing connection until main process sync finishes...");
        return null;
    }

    console.log("[SpacetimeDBProvider] BUILDING connection:", { uri: stUri, db: stDb, token: activeToken ? activeToken.slice(0, 10) + "..." : "none" });

    return DbConnection.builder()
      .withUri(stUri)
      .withDatabaseName(stDb)
      .withToken(activeToken)
      .onConnect((connection, identity, token) => {
        const currentLocal = localStorage.getItem("auth_token");
        console.log("[SpacetimeDBProvider] Connected!", { 
          identity: identity.toHexString().slice(0, 10) + "...", 
          tokenReceived: token ? "yes" : "no",
          matchesLocal: token === currentLocal
        });
        
        setLastError(null);
        
        // Only trigger a persistence/broadcast if it's actually new
        if (token && token !== currentLocal) {
            console.log("[SpacetimeDBProvider] Persisting new token to Main.");
            localStorage.setItem("auth_token", token);
            // @ts-ignore
            if (window.api?.setToken) window.api.setToken(token);
        }

        const sub = connection.subscriptionBuilder();
        sub.onApplied(() => console.log("[SpacetimeDBProvider] Subscription applied."));
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
          "SELECT * FROM MessageDeliveryStatus",
          "SELECT * FROM UserIdentity"
        ]);
      })
      .onConnectError((_ctx, err: any) => {
        const errorStr = String(err);
        console.error("[SpacetimeDBProvider] Connection Fail:", errorStr);
        setLastError(err);
        
        const isAuthError = errorStr.includes('403') || errorStr.includes('401') || (err?.message && (err.message.includes('403') || err.message.includes('401')));
        
        if (activeToken && isAuthError) {
          console.warn("[SpacetimeDBProvider] Invalid Token Detected. Clearing Identity.");
          localStorage.removeItem("auth_token");
          setActiveToken(undefined);
          // @ts-ignore
          if (window.api?.setToken) window.api.setToken('');
        }
      })
      .onDisconnect(() => {
        console.log("[SpacetimeDBProvider] Disconnected.");
      });
  }, [activeToken, stUri, stDb, isSyncingMain]);

  return (
    <ErrorContext.Provider value={{ lastError, setLastError }}>
      {builder ? (
        <Provider key={`${activeToken || 'anon'}-${stUri}-${stDb}`} connectionBuilder={builder}>
          {children}
        </Provider>
      ) : (
        <div style={{ color: '#94A3B8', fontSize: '12px', padding: '10px' }}>Syncing Identity...</div>
      )}
    </ErrorContext.Provider>
  );
};
