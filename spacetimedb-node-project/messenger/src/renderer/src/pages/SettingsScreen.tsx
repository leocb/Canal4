import { useState, useEffect } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { useParams, useNavigate } from 'react-router-dom';
import { tables, reducers } from '../module_bindings/index';

type Tab = 'logs' | 'pairing' | 'settings';

// --- Ticker Settings (persisted to localStorage) ---
export interface TickerSettings {
  position: 'top' | 'bottom';
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  bgColor: string;
  fgColor: string;
  scrollSpeed: number; // seconds for one full pass
  repeatCount: number;
}

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  position: 'bottom',
  fontFamily: 'monospace',
  fontSize: 28,
  fontWeight: '600',
  bgColor: 'rgba(0,0,0,0.75)',
  fgColor: '#ffffff',
  scrollSpeed: 15,
  repeatCount: 1,
};

export function loadTickerSettings(): TickerSettings {
  try {
    const stored = localStorage.getItem('ticker_settings');
    if (stored) return { ...DEFAULT_TICKER_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_TICKER_SETTINGS;
}

function saveTickerSettings(s: TickerSettings) {
  localStorage.setItem('ticker_settings', JSON.stringify(s));
}

// --- Component ---
export const SettingsScreen = () => {
  const { isActive: connected } = useSpacetimeDB();
  const [messages] = useTable(tables.Message);
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [templates] = useTable(tables.MessageTemplate);
  const [devices] = useTable(tables.MessengerDevice);
  const [users] = useTable(tables.User);
  const [deliveryStatuses] = useTable(tables.MessageDeliveryStatus);

  const [machineUid, setMachineUid] = useState<string>('Loading...');
  const [pins] = useTable(tables.MessengerPairingPin);
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab: Tab = (tab as Tab) || 'pairing';
  const [tickerSettings, setTickerSettingsState] = useState<TickerSettings>(loadTickerSettings());

  const [stUri, setStUri] = useState<string>(localStorage.getItem("spacetime_uri") || "ws://127.0.0.1:3000");
  const [stDb, setStDb] = useState<string>(localStorage.getItem("spacetime_db") || "spacetimedb-node-project-gybhi");

  // Ticker position settings IPC
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([{ id: 0, label: 'Primary Display' }]);
  const [selectedDisplay, setSelectedDisplay] = useState<number>(
    parseInt(localStorage.getItem('ticker_display') || '0', 10)
  );

  const requestPin = useReducer(reducers.createMessengerPin);
  const updateDevice = useReducer(reducers.messengerConnect);

  useEffect(() => {
    // @ts-ignore
    if (window.api?.getMachineId) {
      // @ts-ignore
      window.api.getMachineId().then((uid: string) => setMachineUid(uid));
    } else {
      const stored = localStorage.getItem('fallback_uid');
      if (stored) {
        setMachineUid(stored);
      } else {
        const id = 'fallback_' + Math.random().toString(36).slice(2, 9);
        localStorage.setItem('fallback_uid', id);
        setMachineUid(id);
      }
    }
  }, []);

  const activePin = pins.find(p => p.messengerUid === machineUid);

  // This device's registration entries
  const myDevices = devices.filter(d => d.uid === machineUid);

  // Build full log list (last 50 messages, newest first)
  const logList = [...messages]
    .sort((a, b) => Number(b.sentAt.microsSinceUnixEpoch - a.sentAt.microsSinceUnixEpoch))
    .slice(0, 50);

  const getVenueName = (id: bigint) => venues.find(v => v.venueId === id)?.name ?? `Venue #${id}`;
  const getChannelName = (id: bigint) => channels.find(c => c.channelId === id)?.name ?? `Channel #${id}`;
  const getTemplateName = (id?: bigint | null) =>
    id ? (templates.find(t => t.templateId === id)?.name ?? `Template #${id}`) : 'Manual';
  const getUserName = (id: bigint) => users.find(u => u.userId === id)?.name ?? `User #${id}`;
  const getStatus = (msgId: bigint, deviceId: bigint) =>
    deliveryStatuses.find(s => s.messageId === msgId && s.messengerId === deviceId)?.status.tag ?? 'Unknown';

  const updateTickerSetting = <K extends keyof TickerSettings>(key: K, value: TickerSettings[K]) => {
    const updated = { ...tickerSettings, [key]: value };
    setTickerSettingsState(updated);
    saveTickerSettings(updated);
  };

  const FONT_OPTIONS = [
    { value: 'monospace', label: 'Monospace' },
    { value: 'Inter, sans-serif', label: 'Inter' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: 'Impact, sans-serif', label: 'Impact' },
    { value: 'Courier New, monospace', label: 'Courier New' },
  ];

  const handleSaveSpacetimeSettings = () => {
    localStorage.setItem("spacetime_uri", stUri);
    localStorage.setItem("spacetime_db", stDb);
    window.location.reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0B0E14', color: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? '#10B981' : '#EF4444', boxShadow: `0 0 6px ${connected ? '#10B981' : '#EF4444'}` }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Courier Node</h2>
          {machineUid !== 'Loading...' && myDevices.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: '#64748b', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '8px' }}>
              {myDevices.length} venue{myDevices.length !== 1 ? 's' : ''} paired
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {(['pairing', 'logs', 'settings'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => navigate(`/settings/${tab}`)}
              style={{
                padding: '6px 14px',
                fontSize: '0.85rem',
                borderRadius: '8px',
                background: activeTab === tab ? '#3B82F6' : 'rgba(255,255,255,0.06)',
                color: activeTab === tab ? '#fff' : '#94A3B8',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontWeight: activeTab === tab ? 600 : 400,
              }}
            >
              {tab === 'pairing' ? '🔗 Pairing' : tab === 'logs' ? '📋 Logs' : '⚙️ Settings'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

        {/* === PAIRING TAB === */}
        {activeTab === 'pairing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px', margin: '0 auto' }}>

            {/* Status Card */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem' }}>Connection Status</h3>
                <span style={{
                  fontSize: '0.8rem', padding: '3px 10px', borderRadius: '12px', fontWeight: 600,
                  background: connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: connected ? '#10B981' : '#EF4444',
                  border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {connected ? '● Connected' : '● Disconnected'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                Device ID: {machineUid}
              </p>
            </div>

            {/* Connected Venues */}
            {myDevices.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Paired Venues</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {myDevices.map(device => (
                    <div key={device.messengerId.toString()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{getVenueName(device.venueId)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>as "{device.name}"</div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#10B981' }}>✓ Active</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pair New Venue */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Register with a New Venue</h3>
              <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '20px', lineHeight: 1.5 }}>
                Generate a 6-digit PIN, then enter it in the Web Dashboard under{' '}
                <strong style={{ color: '#F8FAFC' }}>Venue → Desktop Displays → Add Node</strong>.
              </p>

              {activePin ? (
                <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(59,130,246,0.08)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '8px' }}>Enter this PIN in the Web Dashboard:</div>
                  <div style={{ fontSize: '3rem', letterSpacing: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#3B82F6' }}>
                    {activePin.pin}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px' }}>
                    Valid for 10 minutes
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    updateDevice({ messengerUid: machineUid });
                    requestPin({ messengerUid: machineUid });
                  }}
                  disabled={machineUid.startsWith('Loading') || !connected}
                  style={{ width: '100%', padding: '12px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Generate Pairing PIN
                </button>
              )}
            </div>
          </div>
        )}

        {/* === LOGS TAB === */}
        {activeTab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>
            
            <div style={{ display: 'flex', gap: '20px' }}>
              {/* Status Card Mini */}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', color: '#94A3B8' }}>Connection Status</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '0.8rem', padding: '3px 10px', borderRadius: '12px', fontWeight: 600,
                    background: connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: connected ? '#10B981' : '#EF4444',
                    border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}>
                    {connected ? '● Connected' : '● Disconnected'}
                  </span>
                </div>
              </div>

              {/* Venues Card Mini */}
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#94A3B8' }}>Paired Venues</h3>
                {myDevices.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {myDevices.map(device => (
                      <span key={device.messengerId.toString()} style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: '8px' }}>
                        {getVenueName(device.venueId)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>None</span>
                )}
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', marginTop: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>Recent Messages</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {logList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 24px', color: '#64748b' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📭</div>
                  <h3>No Messages Yet</h3>
                  <p style={{ marginTop: '8px', fontSize: '0.9rem' }}>Messages from paired venues will appear here.</p>
                </div>
              ) : (
              logList.map((msg, idx) => {
                const channel = channels.find(c => c.channelId === msg.channelId);
                const venue = channel ? venues.find(v => v.venueId === channel.venueId) : null;
                const prevMsg = idx > 0 ? logList[idx - 1] : null;
                const msgDate = new Date(Number(msg.sentAt.microsSinceUnixEpoch / 1000n));
                const prevDate = prevMsg ? new Date(Number(prevMsg.sentAt.microsSinceUnixEpoch / 1000n)) : null;
                const showDivider = !prevDate || prevDate.toDateString() !== msgDate.toDateString();

                return (
                  <div key={msg.messageId.toString()}>
                    {showDivider && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0', color: '#475569', fontSize: '0.75rem' }}>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                        {msgDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                      </div>
                    )}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(59,130,246,0.5)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <span>{msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>·</span>
                        {venue && <span style={{ color: '#94A3B8' }}>{venue.name}</span>}
                        {channel && <><span>›</span><span style={{ color: '#94A3B8' }}>{channel.name}</span></>}
                        <span>·</span>
                        <span>{getTemplateName(msg.templateId)}</span>
                        <span>·</span>
                        <span>by {getUserName(msg.senderId)}</span>
                      </div>
                      <div style={{ fontSize: '0.95rem', lineHeight: 1.4, color: '#F1F5F9', wordBreak: 'break-word' }}>
                        {msg.content}
                      </div>
                      {/* Delivery status per device */}
                      {myDevices.length > 0 && (
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {myDevices.map(d => {
                            const status = getStatus(msg.messageId, d.messengerId);
                            const icon = status === 'Shown' ? '✅' : status === 'InProgress' ? '▶️' : status === 'Enqueued' ? '🕐' : '❓';
                            return (
                              <span key={d.messengerId.toString()} style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {icon} {d.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </div>
        )}

            {/* === SETTINGS TAB === */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px', margin: '0 auto' }}>

            {/* SpacetimeDB Connection */}
            <section style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>SpacetimeDB Connection</h3>
                <button
                  onClick={handleSaveSpacetimeSettings}
                  style={{ padding: '6px 12px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save &amp; Reload
                </button>
              </div>

              <label style={labelStyle}>Connection URI</label>
              <input
                type="text"
                value={stUri}
                onChange={e => setStUri(e.target.value)}
                style={{ ...inputStyle, marginBottom: '14px' }}
                placeholder="ws://127.0.0.1:3000"
              />

              <label style={labelStyle}>Database Name</label>
              <input
                type="text"
                value={stDb}
                onChange={e => setStDb(e.target.value)}
                style={inputStyle}
                placeholder="spacetimedb-node-project-gybhi"
              />
            </section>

            {/* Display Position */}
            <section style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Display &amp; Position</h3>

              <label style={labelStyle}>Monitor</label>
              <select
                value={selectedDisplay}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  setSelectedDisplay(v);
                  localStorage.setItem('ticker_display', String(v));
                }}
                style={selectStyle}
              >
                {displays.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>

              <label style={{ ...labelStyle, marginTop: '14px' }}>Position on Screen</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['bottom', 'top'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => updateTickerSetting('position', pos)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid',
                      borderColor: tickerSettings.position === pos ? '#3B82F6' : 'rgba(255,255,255,0.1)',
                      background: tickerSettings.position === pos ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                      color: tickerSettings.position === pos ? '#3B82F6' : '#94A3B8',
                      fontWeight: tickerSettings.position === pos ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {pos === 'bottom' ? '⬇ Bottom' : '⬆ Top'}
                  </button>
                ))}
              </div>
            </section>

            {/* Typography */}
            <section style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Typography</h3>

              <label style={labelStyle}>Font Family</label>
              <select
                value={tickerSettings.fontFamily}
                onChange={e => updateTickerSetting('fontFamily', e.target.value)}
                style={selectStyle}
              >
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>

              <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Font Size (px)</label>
                  <input
                    type="number" min={12} max={80}
                    value={tickerSettings.fontSize}
                    onChange={e => updateTickerSetting('fontSize', parseInt(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Font Weight</label>
                  <select
                    value={tickerSettings.fontWeight}
                    onChange={e => updateTickerSetting('fontWeight', e.target.value as TickerSettings['fontWeight'])}
                    style={selectStyle}
                  >
                    <option value="400">Regular</option>
                    <option value="600">Semi-Bold</option>
                    <option value="700">Bold</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Colors */}
            <section style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Colors</h3>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Text Color</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="color" value={tickerSettings.fgColor} onChange={e => updateTickerSetting('fgColor', e.target.value)} style={{ width: '40px', height: '40px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'transparent' }} />
                    <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'monospace' }}>{tickerSettings.fgColor}</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Background Color</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="color" value={tickerSettings.bgColor.startsWith('rgba') ? '#000000' : tickerSettings.bgColor} onChange={e => updateTickerSetting('bgColor', e.target.value)} style={{ width: '40px', height: '40px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'transparent' }} />
                    <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'monospace' }}>{tickerSettings.bgColor}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Scroll & Repeat */}
            <section style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Playback</h3>

              <label style={labelStyle}>Scroll Speed ({tickerSettings.scrollSpeed}s per pass)</label>
              <input
                type="range" min={5} max={60} step={1}
                value={tickerSettings.scrollSpeed}
                onChange={e => updateTickerSetting('scrollSpeed', parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#3B82F6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>
                <span>Fast (5s)</span><span>Slow (60s)</span>
              </div>

              <label style={{ ...labelStyle, marginTop: '16px' }}>Repeat Each Message</label>
              <input
                type="number" min={1} max={10}
                value={tickerSettings.repeatCount}
                onChange={e => updateTickerSetting('repeatCount', parseInt(e.target.value))}
                style={{ ...inputStyle, width: '100px' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '8px' }}>time(s)</span>
            </section>

            {/* Preview */}
            <section style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Preview</h3>
              <div style={{ borderRadius: '8px', overflow: 'hidden', height: '60px', display: 'flex', alignItems: 'center', background: tickerSettings.bgColor.startsWith('rgba') ? tickerSettings.bgColor : tickerSettings.bgColor, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ paddingLeft: '100%', animation: `marquee ${tickerSettings.scrollSpeed}s linear infinite`, fontFamily: tickerSettings.fontFamily, fontSize: `${Math.min(tickerSettings.fontSize, 28)}px`, fontWeight: tickerSettings.fontWeight, color: tickerSettings.fgColor, whiteSpace: 'nowrap' }}>
                  Sample: Welcome to Courier Notifications! 📢
                </div>
              </div>
              <style>{`@keyframes marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-150%) } }`}</style>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#94A3B8',
  marginBottom: '6px',
  fontWeight: 500,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#F8FAFC',
  padding: '10px 14px',
  borderRadius: '8px',
  fontSize: '0.9rem',
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#F8FAFC',
  padding: '10px 14px',
  borderRadius: '8px',
  fontSize: '0.9rem',
  outline: 'none',
};
