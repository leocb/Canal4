import { useEffect, useState, useRef } from 'react';
import { useTable, useSpacetimeDB, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index';
import { loadTickerSettings } from './SettingsScreen';

function getAlphaFromColor(color: string): number {
    if (color.startsWith('rgba')) {
        const parts = color.match(/[\d.]+/g);
        if (parts && parts.length === 4) {
            return parseFloat(parts[3]);
        }
    }
    return 1;
}

export const TickerScreen = () => {
    const [messages] = useTable(tables.Message);
    const [devices] = useTable(tables.MessengerDevice);
    const [statuses] = useTable(tables.MessageDeliveryStatus);
    const { isActive: connected } = useSpacetimeDB();
    
    const updateStatus = useReducer(reducers.updateMessageDeliveryStatus);
    
    const [machineUid, setMachineUid] = useState<string>('');
    const [activeMessage, setActiveMessage] = useState<{ id: bigint; messengerId: bigint; text: string; repeat: number; totalRepeats: number; isTest?: boolean } | null>(null);
    const isAnimating = useRef(false);
    const [settings, setSettings] = useState(loadTickerSettings());
    const marqueeRef = useRef<HTMLDivElement>(null);
    const [animationDuration, setAnimationDuration] = useState<number>(10); // fallback

    // Fix 1: Record start time with a generous buffer (5s behind) to avoid clock sync issues
    const [appStartTime] = useState<number>(() => Date.now());
    
    // Guard against race conditions where a message is finished but hasn't updated to 'Shown' in DB yet
    const effectivelyShownIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Listen for settings changes and test messages from other windows
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'ticker_settings') {
                console.log("[Ticker] Settings updated from storage");
                setSettings(loadTickerSettings());
            }
            if (e.key === 'test_message' && e.newValue) {
                console.log("[Ticker] Test message received:", e.newValue);
                const text = e.newValue;
                // If already showing a test message, we just update it
                // If showing a real message, we wait? No, let's interrupt for testing
                setActiveMessage({
                    id: -1n,
                    messengerId: -1n,
                    text: text,
                    repeat: 0,
                    totalRepeats: loadTickerSettings().repeatCount,
                    isTest: true
                });
                isAnimating.current = true;
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    useEffect(() => {
        if (window.api?.getMachineId) {
            window.api.getMachineId().then((uid: string) => {
                console.log("[Ticker] Machine ID loaded:", uid);
                setMachineUid(uid);
            });
        } else {
            const id = localStorage.getItem('fallback_uid') || 'fallback_' + Math.random().toString(36).slice(2, 9);
            if (!localStorage.getItem('fallback_uid')) localStorage.setItem('fallback_uid', id);
            setMachineUid(id);
        }
    }, []);

    // Window Visibility Control
    useEffect(() => {
        if (window.api?.showTicker && window.api?.hideTicker) {
            if (activeMessage && connected) {
                console.log("[Ticker] Showing window for message");
                window.api.showTicker();
            } else {
                console.log("[Ticker] Hiding window - no active message or disconnected");
                window.api.hideTicker();
            }
        }
    }, [!!activeMessage, connected]);

    useEffect(() => {
        if (window.api?.updateTickerPosition) {
            console.log("[Ticker] Updating window position to:", settings.position);
            window.api.updateTickerPosition(settings.position);
        }
    }, [settings.position]);

    // Recalculate animation duration whenever message or settings change
    useEffect(() => {
        if (activeMessage && marqueeRef.current) {
            const width = marqueeRef.current.scrollWidth;
            // The travel distance is 'width' because of padding-left: 100% and translate(-100%)
            const duration = width / settings.scrollSpeed;
            console.log("[Ticker] Calculated animation duration:", duration, "s for width:", width);
            setAnimationDuration(duration);
        }
    }, [activeMessage, settings.scrollSpeed, settings.fontSize, settings.fontFamily]);

    // Cleanup finished IDs once DB reflects 'Shown' status
    useEffect(() => {
        const myDevices = devices.filter(d => d.uid === machineUid);
        const myMessengerIds = myDevices.map(d => BigInt(d.messengerId));
        
        for (const idStr of effectivelyShownIds.current) {
            const id = BigInt(idStr);
            const status = Array.from(statuses).find(s => {
                const sid = BigInt(s.messageId);
                const smid = BigInt(s.messengerId);
                return sid === id && myMessengerIds.some(mid => mid === smid);
            });
            
            if (!status || status.status.tag === 'Shown') {
                console.log("[Ticker] DB reflect 'Shown' for:", idStr);
                effectivelyShownIds.current.delete(idStr);
            }
        }
    }, [statuses, machineUid, devices]);

    useEffect(() => {
        // Early return if already animating or not ready
        if (!machineUid || !connected || isAnimating.current || activeMessage) return;

        const myDevices = devices.filter(d => d.uid === machineUid);
        if (myDevices.length === 0) return;

        const myMessengerIds = myDevices.map(d => BigInt(d.messengerId));

        // Build the pending queue for this machine
        const pendingQueue = Array.from(statuses)
            .filter(s => {
                const isMine = myMessengerIds.includes(BigInt(s.messengerId));
                const isPending = s.status.tag === 'Queued' || s.status.tag === 'InProgress';
                const notRecentlyShown = !effectivelyShownIds.current.has(s.messageId.toString());
                return isMine && isPending && notRecentlyShown;
            })
            .map(status => ({
               statusRec: status,
               msg: messages.find(m => BigInt(m.messageId) === BigInt(status.messageId))
            }))
            .filter(({ msg }) => {
                if (!msg) return false;
                const msgTimeMs = Number(BigInt(msg.sentAt.microsSinceUnixEpoch) / 1000n);
                // ONLY messages sent AFTER this app instance started (with 1s buffer)
                return msgTimeMs >= (appStartTime - 1000);
            })
            // Sort by message time (oldest first)
            .sort((a, b) => {
                const tA = BigInt(a.msg!.sentAt.microsSinceUnixEpoch);
                const tB = BigInt(b.msg!.sentAt.microsSinceUnixEpoch);
                if (tA < tB) return -1;
                if (tA > tB) return 1;
                return 0;
            });

        if (pendingQueue.length > 0) {
            const next = pendingQueue[0];
            const repeatCount = settings.repeatCount;
            
            console.log("[Ticker] STARTING message:", next.msg!.content, "ID:", next.msg!.messageId.toString());
            
            setActiveMessage({ 
                id: next.msg!.messageId, 
                messengerId: next.statusRec.messengerId,
                text: next.msg!.content, 
                repeat: 0, 
                totalRepeats: repeatCount 
            });
            isAnimating.current = true;
            
            // Mark as InProgress in DB
            updateStatus({ 
                uid: machineUid, 
                messageId: next.msg!.messageId, 
                statusTag: 'InProgress'
            }).catch(err => {
                console.error("[Ticker] updateStatus(InProgress) failed for ID:", next.msg!.messageId.toString(), "Error:", err);
            });
        }
    }, [messages, statuses, devices, machineUid, connected, activeMessage, appStartTime, settings.repeatCount]);

    const handleAnimationIteration = () => {
        if (!activeMessage || !machineUid) return;

        if (activeMessage.isTest) {
            // Bypass DB checks for test messages
            const nextRepeat = activeMessage.repeat + 1;
            if (nextRepeat < activeMessage.totalRepeats) {
                setActiveMessage(prev => prev ? { ...prev, repeat: nextRepeat } : null);
            } else {
                setActiveMessage(null);
                isAnimating.current = false;
            }
            return;
        }

        const msgExists = messages.some(m => BigInt(m.messageId) === BigInt(activeMessage.id));
        const deviceExists = devices.some(d => BigInt(d.messengerId) === BigInt(activeMessage.messengerId));
        
        if (!msgExists || !deviceExists) {
            console.log("[Ticker] Message or device disappeared, stopping.");
            setActiveMessage(null);
            isAnimating.current = false;
            return;
        }
        
        const nextRepeat = activeMessage.repeat + 1;
        console.log("[Ticker] Iteration end:", nextRepeat, "/", activeMessage.totalRepeats);
        
        if (nextRepeat < activeMessage.totalRepeats) {
            setActiveMessage(prev => prev ? { ...prev, repeat: nextRepeat } : null);
        } else {
            console.log("[Ticker] FINISHED message:", activeMessage.id.toString());
            const finalIdStr = activeMessage.id.toString();
            effectivelyShownIds.current.add(finalIdStr);
            
            updateStatus({ 
                uid: machineUid, 
                messageId: activeMessage.id, 
                statusTag: 'Shown'
            }).catch(err => console.error("[Ticker] Failed to update status to Shown:", err));
            
            setActiveMessage(null);
            isAnimating.current = false;
        }
    };

    if (!activeMessage || !connected) return null;

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            background: settings.bgColor,
            borderTop: (settings.position === 'bottom') ? '2px solid rgba(59,130,246,0.6)' : 'none',
            borderBottom: (settings.position === 'top') ? '2px solid rgba(59,130,246,0.6)' : 'none',
            overflow: 'hidden',
            fontFamily: settings.fontFamily,
            color: settings.fgColor,
            fontSize: `${settings.fontSize}px`,
            fontWeight: settings.fontWeight,
            whiteSpace: 'nowrap'
        }}>
           <div
               ref={marqueeRef}
               className="marquee"
               onAnimationIteration={handleAnimationIteration}
               style={{ 
                   textShadow: `1px 1px 4px rgba(0,0,0,${0.8 * getAlphaFromColor(settings.fgColor)})`,
                   animationDuration: `${animationDuration}s`
               }}
           >
               {activeMessage.text}
           </div>
           
           <style>{`
             .marquee {
               display: inline-block;
               padding-left: 100%;
               animation: marquee linear infinite;
             }
             
             @keyframes marquee {
               0%   { transform: translate(0, 0); }
               100% { transform: translate(-100%, 0); }
             }
           `}</style>
        </div>
    );
};
