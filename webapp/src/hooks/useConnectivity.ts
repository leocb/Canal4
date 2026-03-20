import { useState, useEffect, useCallback } from 'react';
import { useConnectivity as useConnectivityInternal } from '../SpacetimeDBProvider';

export type ConnectivityStatus = 'online' | 'offline' | 'error';

export const useConnectivity = () => {
    const { status, error: connectionError, reconnect } = useConnectivityInternal();
    const [nextRetryIn, setNextRetryIn] = useState<number>(15);

    // Track if we've ever seen an error or a disconnect after being online
    const [hasAttemptFailed, setHasAttemptFailed] = useState(false);

    useEffect(() => {
        if (status === 'error') {
            setHasAttemptFailed(true);
        }
    }, [status]);

    const triggerReconnect = useCallback(() => {
        console.log("Auto-reconnect triggered from hook");
        setNextRetryIn(15);
        reconnect();
    }, [reconnect]);

    // Reconnection countdown logic
    useEffect(() => {
        if (status === 'online') {
            setNextRetryIn(15);
            setHasAttemptFailed(false);
            return;
        }

        // Only run countdown if we've explicitly failed or are in an error state
        if (status === 'error' || hasAttemptFailed) {
            const interval = setInterval(() => {
                setNextRetryIn((prev) => {
                    if (prev <= 0) return 0;
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [status, hasAttemptFailed]);

    // Auto-reconnect trigger
    useEffect(() => {
        if ((status === 'error' || (status === 'offline' && hasAttemptFailed)) && nextRetryIn === 0) {
            triggerReconnect();
        }
    }, [status, nextRetryIn, hasAttemptFailed, triggerReconnect]);

    return { 
        status, 
        isActive: status === 'online', 
        connectionError, 
        nextRetryIn, 
        reconnect: triggerReconnect,
        hasAttemptFailed
    };
};
