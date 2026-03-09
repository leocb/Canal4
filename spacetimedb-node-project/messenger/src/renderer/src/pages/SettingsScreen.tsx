import { useState, useEffect } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index';

// We mock generating the UID for prototype. In production, Electron 'main' creates this via IPC and saves safely.
export const SettingsScreen = () => {
    const { identity: _ } = useSpacetimeDB();
    const [messages] = useTable(tables.Message);
    
    const [machineUid, setMachineUid] = useState<string>('Loading...');
    
    useEffect(() => {
        // @ts-ignore
        if (window.api && window.api.getMachineId) {
            // @ts-ignore
            window.api.getMachineId().then(uid => setMachineUid(uid))
        } else {
            setMachineUid("fallback_uid_" + Math.random().toString(36).slice(2,9))
        }
    }, [])
    
    const requestPin = useReducer(reducers.createMessengerPin);
    const updateDevice = useReducer(reducers.messengerConnect);
    const [pins] = useTable(tables.MessengerPairingPin);
    
    const [activeTab, setActiveTab] = useState<'logs' | 'settings'>('logs');
    
    // Reverse chronological message list
    const logList = [...messages]
       .sort((a,b) => Number(b.sentAt.microsSinceUnixEpoch - a.sentAt.microsSinceUnixEpoch))
       .slice(0, 20);
       
    const activePin = pins.find(p => p.messengerUid === machineUid);

    return (
        <div className="app-container" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-color)' }}>
            <div className="screen-header" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
                <h2>Courier Node</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={activeTab === 'logs' ? 'primary' : 'secondary'} onClick={() => setActiveTab('logs')}>Recent Logs</button>
                    <button className={activeTab === 'settings' ? 'primary' : 'secondary'} onClick={() => setActiveTab('settings')}>Settings & Pairing</button>
                </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {activeTab === 'logs' ? (
                <div className="flex-col" style={{ gap: '16px' }}>
                    {logList.length === 0 ? (
                        <div className="empty-state glass-panel">
                            <h3>No Recent Messages</h3>
                            <p style={{ marginTop: '8px' }}>Messages from paired venues will appear here.</p>
                        </div>
                    ) : logList.map(msg => (
                        <div key={msg.messageId} className="glass-panel" style={{ padding: '16px', position: 'relative' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                                Received: {new Date(Number(msg.sentAt.microsSinceUnixEpoch) / 1000).toLocaleString()} <br/>
                                Sender: {msg.senderIdentity.toHexString().slice(0,8)}
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>
                                {msg.content}
                            </div>
                            <div style={{ position: 'absolute', top: '16px', right: '16px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(78, 204, 163, 0.2)', color: 'var(--accent-color)', fontSize: '0.75rem', fontWeight: 600 }}>
                                {msg.templateId ? 'TEMPLATE' : 'BROADCAST'}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex-col" style={{ gap: '24px' }}>
                    <div className="glass-panel" style={{ padding: '24px' }}>
                        <h3 style={{ marginBottom: '8px' }}>Device Pairing Configuration</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                           Pair this desktop agent with a Courier venue to begin receiving its notifications.
                        </p>
                        
                        {activePin ? (
                             <div className="flex-col" style={{ alignItems: 'center', padding: '24px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                 <div style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>Enter this PIN in the Web Dashboard:</div>
                                 <div style={{ fontSize: '2.5rem', letterSpacing: '8px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-color)'}}>
                                     {activePin.pin}
                                 </div>
                                 <div style={{ marginTop: '16px', fontSize: '0.8rem', color: '#888' }}>
                                    Device UID mapping: {machineUid}
                                 </div>
                             </div>
                        ) : (
                            <button onClick={() => {
                                // Mark connection then request PIN
                                updateDevice({ messengerUid: machineUid });
                                requestPin({ messengerUid: machineUid });
                            }} disabled={machineUid.startsWith('Loading')}>Generate Pairing PIN</button>
                        )}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};
