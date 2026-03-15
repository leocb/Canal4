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

    useEffect(() => {
        // @ts-ignore
        if (window.api?.getMachineId) {
            // @ts-ignore
            window.api.getMachineId().then((uid: string) => setMachineUid(uid));
        } else {
            const stored = localStorage.getItem('fallback_uid');
            if (stored) setMachineUid(stored);
        }
    }, []);

    useEffect(() => {
        if (!machineUid || !connected || isAnimating.current) return;

        const myDevices = devices.filter(d => d.uid === machineUid);
        if (myDevices.length === 0) return;

        const myMessengerIds = myDevices.map(d => d.messengerId);

        // Find messages for ALL my pairings that are Queued or InProgress
        const pendingQueue = Array.from(statuses.values())
            .filter(s => myMessengerIds.includes(s.messengerId) && (s.status.tag === 'Queued' || s.status.tag === 'InProgress'))
            .map(status => ({
               statusRec: status,
               msg: messages.find(m => m.messageId === status.messageId)
            }))
            .filter(({ msg }) => msg !== undefined)
            .sort((a, b) => Number(a.msg!.sentAt.microsSinceUnixEpoch - b.msg!.sentAt.microsSinceUnixEpoch));

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
            
            // Mark as InProgress
            updateStatus({ 
                uid: machineUid, 
                messageId: next.msg!.messageId, 
                statusTag: 'InProgress'
            });
        }
    }, [messages, statuses, devices, machineUid, connected]);

    const handleAnimationIteration = () => {
        if (!activeMessage) return;

        // Safety check: has the message been deleted?
        const stillExists = messages.some(m => m.messageId === activeMessage.id);
        if (!stillExists) {
            setActiveMessage(null);
            isAnimating.current = false;
            return;
        }
        
        const nextRepeat = activeMessage.repeat + 1;
        if (nextRepeat <= activeMessage.totalRepeats) {
            // Show it again
            setActiveMessage(prev => prev ? { ...prev, repeat: nextRepeat } : null);
        } else {
            // Done showing this message
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
