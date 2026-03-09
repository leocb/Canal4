import { useEffect, useState, useRef } from 'react';
import { useTable, useSpacetimeDB, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index';

export const TickerScreen = () => {
    const [messages] = useTable(tables.Message);
    const [devices] = useTable(tables.MessengerDevice);
    const [statuses] = useTable(tables.MessageDeliveryStatus);
    const { identity } = useSpacetimeDB();
    
    const updateStatus = useReducer(reducers.updateMessageDeliveryStatus);
    
    const [machineUid, setMachineUid] = useState<string>('');
    const [activeMessage, setActiveMessage] = useState<{ id: bigint, text: string } | null>(null);
    const isAnimating = useRef(false);

    useEffect(() => {
        // @ts-ignore
        if (window.api && window.api.getMachineId) {
            // @ts-ignore
            window.api.getMachineId().then(uid => setMachineUid(uid))
        }
    }, [])

    useEffect(() => {
        if (!machineUid || isAnimating.current) return;

        // 1. Resolve this machine's internal device ID if connected
        const myDevice = devices.find(d => d.uid === machineUid);
        if (!myDevice) return;

        // Find messages paired to this machine UI that are NOT 'Shown'
        const pendingQueue = Array.from(statuses.values())
            .filter(s => s.messengerId === myDevice.messengerId && s.status.tag !== 'Shown')
            .map(status => ({
               statusRec: status,
               msg: messages.find(m => m.messageId === status.messageId)
            }))
            .filter(({ msg }) => msg !== undefined)
            .sort((a,b) => Number(a.msg!.sentAt.microsSinceUnixEpoch - b.msg!.sentAt.microsSinceUnixEpoch));

        if (pendingQueue.length > 0) {
            const next = pendingQueue[0];
            setActiveMessage({ id: next.msg!.messageId, text: next.msg!.content });
            isAnimating.current = true;
            
            // Mark as InProgress
            updateStatus({ 
                uid: machineUid, 
                messageId: next.msg!.messageId, 
                statusTag: 'InProgress'
            });
        }
    }, [messages, statuses, devices, machineUid, activeMessage]);

    // Triggers when the infinite CSS animation loops (using onAnimationIteration for seamless flow)
    const handleAnimationIteration = () => {
        if (activeMessage) {
            // Mark the current one as shown
            updateStatus({ 
                uid: machineUid, 
                messageId: activeMessage.id, 
                statusTag: 'Shown'
            });
            // Free the lock immediately so useEffect picks the next from queue
            setActiveMessage(null);
            isAnimating.current = false;
        }
    };

    if (!activeMessage || !identity) return null;

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            borderTop: '2px solid var(--accent-color)',
            overflow: 'hidden',
            fontFamily: 'monospace',
            color: 'white',
            fontSize: '2rem',
            whiteSpace: 'nowrap'
        }}>
           <div className="marquee" onAnimationIteration={handleAnimationIteration}>
               {activeMessage.text}
           </div>
           
           <style>{`
             .marquee {
               display: inline-block;
               padding-left: 100%;
               animation: marquee 15s linear infinite;
               font-weight: 600;
               text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
             }
             
             @keyframes marquee {
               0%   { transform: translate(0, 0); }
               100% { transform: translate(-100%, 0); }
             }
           `}</style>
        </div>
    );
};
