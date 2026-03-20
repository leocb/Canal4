import { useConnectivity as useConnectivityInternal } from '../SpacetimeDBProvider';

export type ConnectivityStatus = 'online' | 'offline' | 'error';

export const useConnectivity = () => {
    const { status, error, reconnect, nextRetryIn, isInitialLoad } = useConnectivityInternal();

    return { 
        status, 
        isActive: status === 'online', 
        connectionError: error, 
        nextRetryIn, 
        reconnect,
        isInitialLoad
    };
};
