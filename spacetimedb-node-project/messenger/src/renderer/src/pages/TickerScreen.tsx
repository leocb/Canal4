import { useEffect, useState, useRef } from 'react';
import { useTable, useSpacetimeDB, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index';
import { loadTickerSettings } from './SettingsScreen';

export const TickerScreen = () => {
    const [messages] = useTable(tables.Message);
    const [devices] = useTable(tables.MessengerDevice);
    const [statuses] = useTable(tables.MessageDeliveryStatus);
    const { isActive: connected } = useSpacetimeDB();
    
    const updateStatus = useReducer(reducers.updateMessageDeliveryStatus);
    
    const [machineUid, setMachineUid] = useState<string>('');
    const [activeMessage, setActiveMessage] = useState<{ id: bigint; messengerId: bigint; text: string; repeat: number; totalRepeats: number } | null>(null);
    const isAnimating = useRef(false);
    const settings = loadTickerSettings();

    // Fix 1: Record start time to ignore history
    const [startTime] = useState<bigint>(() => BigInt(Date.now() * 1000));
    
    // Guard against race conditions where a message is finished but hasn't updated to 'Shown' in DB yet
    const effectivelyShownIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        // @ts-ignore
        if (window.api?.getMachineId) {
            // @ts-ignore
            window.api.getMachineId().then((uid: string) => setMachineUid(uid));
        } else {
            const id = localStorage.getItem('fallback_uid') || 'fallback_' + Math.random().toString(36).slice(2, 9);
            if (!localStorage.getItem('fallback_uid')) localStorage.setItem('fallback_uid', id);
            setMachineUid(id);
        }
    }, []);

    // Cleanup finished IDs once DB reflects 'Shown' status
    useEffect(() => {
        const myDevices = devices.filter(d => d.uid === machineUid);
        const myMessengerIds = myDevices.map(d => d.messengerId);
        
        for (const idStr of effectivelyShownIds.current) {
            const id = BigInt(idStr);
            const status = Array.from(statuses.values()).find(s => s.messageId === id && myMessengerIds.includes(s.messengerId));
            if (!status || status.status.tag === 'Shown') {
                effectivelyShownIds.current.delete(idStr);
            }
        }
    }, [statuses, machineUid, devices]);

    useEffect(() => {
        // Early return if already animating or not ready
        if (!machineUid || !connected || isAnimating.current || activeMessage) return;

        const myDevices = devices.filter(d => d.uid === machineUid);
        if (myDevices.length === 0) return;

        const myMessengerIds = myDevices.map(d => d.messengerId);

        // Build the pending queue for this machine
        const pendingQueue = Array.from(statuses.values())
            .filter(s => {
                const isMine = myMessengerIds.includes(s.messengerId);
                const isPending = s.status.tag === 'Queued' || s.status.tag === 'InProgress';
                const notRecentlyShown = !effectivelyShownIds.current.has(s.messageId.toString());
                return isMine && isPending && notRecentlyShown;
            })
            .map(status => ({
               statusRec: status,
               msg: messages.find(m => m.messageId === status.messageId)
            }))
            // Filter out old messages (history) and ensure we have a valid message record
            .filter(({ msg }) => msg !== undefined && msg.sentAt.microsSinceUnixEpoch >= startTime)
            // Sort by message time (oldest first)
            .sort((a, b) => {
                const timeDiff = Number(a.msg!.sentAt.microsSinceUnixEpoch - b.msg!.sentAt.microsSinceUnixEpoch);
                if (timeDiff !== 0) return timeDiff;
                // If timed same, prioritize InProgress to resume after restart
                if (a.statusRec.status.tag === 'InProgress' && b.statusRec.status.tag === 'Queued') return -1;
                if (b.statusRec.status.tag === 'InProgress' && a.statusRec.status.tag === 'Queued') return 1;
                return 0;
            });

        if (pendingQueue.length > 0) {
            const next = pendingQueue[0];
            const repeatCount = settings.repeatCount;
            
            setActiveMessage({ 
                id: next.msg!.messageId, 
                messengerId: next.statusRec.messengerId,
                text: next.msg!.content, 
                repeat: 1, 
                totalRepeats: repeatCount 
            });
            isAnimating.current = true;
            
            // Mark as InProgress in DB
            updateStatus({ 
                uid: machineUid, 
                messageId: next.msg!.messageId, 
                statusTag: 'InProgress'
            });
        }
    }, [messages, statuses, devices, machineUid, connected, activeMessage, startTime, settings.repeatCount]);

    const handleAnimationIteration = () => {
        if (!activeMessage || !machineUid) return;

        // Safety check: has the message or pairing been removed?
        const msgExists = messages.some(m => m.messageId === activeMessage.id);
        const deviceExists = devices.some(d => d.messengerId === activeMessage.messengerId);
        
        if (!msgExists || !deviceExists) {
            setActiveMessage(null);
            isAnimating.current = false;
            return;
        }
        
        const nextRepeat = activeMessage.repeat + 1;
        if (nextRepeat <= activeMessage.totalRepeats) {
            // Repeat once more
            setActiveMessage(prev => prev ? { ...prev, repeat: nextRepeat } : null);
        } else {
            // Mark as finished locally immediately and then updating server
            const finalIdStr = activeMessage.id.toString();
            effectivelyShownIds.current.add(finalIdStr);
            
            updateStatus({ 
                uid: machineUid, 
                messageId: activeMessage.id, 
                statusTag: 'Shown'
            });
            
            setActiveMessage(null);
            isAnimating.current = false;
        }
    };

    if (!activeMessage) return null;

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            background: settings.bgColor,
            borderTop: settings.position === 'bottom' ? '2px solid rgba(59,130,246,0.6)' : 'none',
            borderBottom: settings.position === 'top' ? '2px solid rgba(59,130,246,0.6)' : 'none',
            overflow: 'hidden',
            fontFamily: settings.fontFamily,
            color: settings.fgColor,
            fontSize: `${settings.fontSize}px`,
            fontWeight: settings.fontWeight,
            whiteSpace: 'nowrap'
        }}>
           <div
               className="marquee"
               onAnimationIteration={handleAnimationIteration}
               style={{ textShadow: '1px 1px 4px rgba(0,0,0,0.8)' }}
           >
               {activeMessage.text}
           </div>
           
           <style>{`
             .marquee {
               display: inline-block;
               padding-left: 100%;
               animation: marquee ${settings.scrollSpeed}s linear infinite;
             }
             
             @keyframes marquee {
               0%   { transform: translate(0, 0); }
               100% { transform: translate(-100%, 0); }
             }
           `}</style>
        </div>
    );
};
