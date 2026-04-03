import { useEffect, useState, useRef } from 'react';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index';
import { loadTickerSettings } from './SettingsScreen';
import { useConnectivity } from '../SpacetimeDBProvider';

function getAlphaFromColor(color: string): number {
    if (color.startsWith('rgba')) {
        const parts = color.match(/[\d.]+/g);
        if (parts && parts.length === 4) {
            return parseFloat(parts[3]);
        }
    }
    return 1;
}

function forceOpaque(color: string): string {
    if (color.startsWith('rgba')) {
        const parts = color.match(/[\d.]+/g);
        if (parts && (parts.length === 3 || parts.length === 4)) {
            return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
        }
    }
    return color;
}

export const TickerScreen = () => {
    const [messages] = useTable(tables.MessageView);
    const [devices] = useTable(tables.DisplayDeviceView);
    const [statuses] = useTable(tables.MessageDeliveryStatusView);
    const { status } = useConnectivity();
    const connected = status === 'online';

    const updateStatus = useReducer(reducers.updateMessageDeliveryStatus);
    const skipMissedMessages = useReducer(reducers.skipMissedMessages);

    const [machineUid, setMachineUid] = useState<string>('');
    const [activeMessage, setActiveMessage] = useState<{ id: bigint; displayId: bigint; text: string; repeat: number; totalRepeats: number; isTest?: boolean } | null>(null);
    const [isFlashing, setIsFlashing] = useState(false);
    const isAnimating = useRef(false);
    const [settings, setSettings] = useState(loadTickerSettings());
    const marqueeRef = useRef<HTMLDivElement>(null);
    const textMeasureRef = useRef<HTMLSpanElement>(null);
    const [animationDuration, setAnimationDuration] = useState<number>(10); // fallback

    useEffect(() => {
        // Flash on new message only if the setting is on
        const isActuallyNew = activeMessage && activeMessage.repeat === 0;
        if (!isActuallyNew || !settings.flashOnNew) return;

        console.log("[Ticker] Flashing for new message...");
        let count = 0;
        const intervalId = setInterval(() => {
            setIsFlashing(prev => !prev);
            count++;
            if (count >= 6) { // 5 full swaps (bg-fg-bg-fg-bg)
                clearInterval(intervalId);
                setIsFlashing(false);
            }
        }, 200);
        return () => {
            clearInterval(intervalId);
            setIsFlashing(false);
        };
    }, [activeMessage?.id, activeMessage?.repeat, settings.flashOnNew]);

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
                    displayId: -1n,
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
            if (!localStorage.getItem('fallback_uid')) {
                localStorage.setItem('fallback_uid', id);
                window.api?.flushStorage?.();
            }
            setMachineUid(id);
        }
    }, []);

    // Window Visibility Control
    useEffect(() => {
        if (window.api?.showTicker && window.api?.hideTicker) {
            if (activeMessage && (connected || activeMessage.isTest)) {
                console.log("[Ticker] Showing window for message");
                window.api.showTicker();
            } else {
                console.log("[Ticker] Hiding window - no active message or disconnected");
                window.api.hideTicker();
            }
        }
    }, [!!activeMessage, connected, activeMessage?.isTest]);

    useEffect(() => {
        const updatePosition = () => {
            if (window.api?.updateTickerPosition && textMeasureRef.current) {
                const fontHeight = textMeasureRef.current.getBoundingClientRect().height;
                // Avoid zero or tiny heights before DOM is ready
                if (fontHeight < 5) return;

                const margin = Math.ceil(fontHeight * 0.10); // proportional 10% margin
                const finalMargin = Math.max(margin, 4); // minimum 4px
                const windowHeight = Math.ceil(fontHeight + finalMargin * 2);

                console.log("[Ticker] Updating window. Measure height:", fontHeight, "Target windowHeight:", windowHeight);
                window.api.updateTickerPosition(settings.position, settings.displayId, windowHeight);
            }
        };

        // Initial attempt and short delays for layout stabilization
        updatePosition();
        const t1 = setTimeout(updatePosition, 100);
        const t2 = setTimeout(updatePosition, 500);

        // Crucial: many custom fonts load asynchronously
        document.fonts.ready.then(updatePosition);

        // Best: Watch the measurement element itself
        const observer = new ResizeObserver(updatePosition);
        if (textMeasureRef.current) {
            observer.observe(textMeasureRef.current);
        }

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            observer.disconnect();
        };
    }, [settings.position, settings.displayId, settings.fontSize, settings.fontFamily, settings.fontWeight]);

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
        const myDisplayIds = myDevices.map(d => BigInt(d.displayId));

        for (const idStr of effectivelyShownIds.current) {
            const id = BigInt(idStr);
            const status = Array.from(statuses).find(s => {
                const sid = BigInt(s.messageId);
                const smid = BigInt(s.displayId);
                return sid === id && myDisplayIds.some(mid => mid === smid);
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

        const myDisplayIds = myDevices.map(d => BigInt(d.displayId));

        // Build the pending queue for this machine
        const pendingQueue = Array.from(statuses)
            .filter(s => {
                const isMine = myDisplayIds.includes(BigInt(s.displayId));
                const isPending = s.status.tag === 'Queued' || s.status.tag === 'InProgress';
                const notRecentlyShown = !effectivelyShownIds.current.has(s.messageId.toString());
                return isMine && isPending && notRecentlyShown;
            })
            .map(status => ({
                statusRec: status,
                msg: messages.find(m => BigInt(m.messageId) === BigInt(status.messageId))
            }))
            .filter(({ msg, statusRec }) => {
                if (!msg) return false;
                // If it's already InProgress (from a previous run), we pick it up regardless of time
                if (statusRec.status.tag === 'InProgress') return true;
                const msgTimeMs = Number(BigInt(msg.sentAt.microsSinceUnixEpoch) / 1000n);
                // ONLY messages sent AFTER this app instance started (with 1s buffer)
                return msgTimeMs >= (appStartTime - 1000);
            })
            // Sort by status (InProgress first) then time (oldest first)
            .sort((a, b) => {
                if (a.statusRec.status.tag === 'InProgress' && b.statusRec.status.tag === 'Queued') return -1;
                if (a.statusRec.status.tag === 'Queued' && b.statusRec.status.tag === 'InProgress') return 1;

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
                displayId: next.statusRec.displayId,
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

    // Handle 'Skipped' status: Mark old messages as 'Skipped' if they were queued while we were offline
    // We do this in bulk via a single reducer call on connection to avoid flooding the network
    useEffect(() => {
        if (!machineUid || !connected) return;

        // Convert ms to micros for SpacetimeDB
        const appStartTimeMicros = BigInt(appStartTime) * 1000n;

        console.log(`[Ticker] Requesting bulk skip for messages before ${appStartTime}ms`);
        skipMissedMessages({
            uid: machineUid,
            appStartTimeMicros
        }).catch(err => {
            console.error("[Ticker] skipMissedMessages failed:", err);
        });
    }, [machineUid, connected, appStartTime, skipMissedMessages]);

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
        const deviceExists = devices.some(d => BigInt(d.displayId) === BigInt(activeMessage.displayId));

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

    // Stop message if cancelled remotely
    useEffect(() => {
        if (!activeMessage || activeMessage.isTest) return;

        const currentStatus = Array.from(statuses).find(s =>
            BigInt(s.messageId) === BigInt(activeMessage.id) &&
            BigInt(s.displayId) === BigInt(activeMessage.displayId)
        );

        if (currentStatus?.status.tag === 'Cancelled') {
            console.log("[Ticker] Actively displayed message was cancelled, stopping immediately.");
            setActiveMessage(null);
            isAnimating.current = false;
        }
    }, [statuses, activeMessage]);

    const hiddenMeasureElement = (
        <span
            ref={textMeasureRef}
            style={{
                position: 'absolute',
                visibility: 'hidden',
                top: '-9999px',
                fontFamily: settings.fontFamily,
                fontSize: `${settings.fontSize}px`,
                fontWeight: settings.fontWeight,
                lineHeight: 'normal',
                whiteSpace: 'nowrap'
            }}
        >
            Mj
        </span>
    );

    if (!activeMessage || (!connected && !activeMessage.isTest)) {
        return hiddenMeasureElement;
    }

    return (
        <>
            {hiddenMeasureElement}
            <div style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                background: isFlashing ? forceOpaque(settings.fgColor) : settings.bgColor,
                borderTop: 'none',
                borderBottom: 'none',
                overflow: 'hidden',
                fontFamily: settings.fontFamily,
                color: isFlashing ? forceOpaque(settings.bgColor) : settings.fgColor,
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
        </>
    );
};
