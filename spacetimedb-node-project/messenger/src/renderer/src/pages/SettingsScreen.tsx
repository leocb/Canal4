import { useState, useEffect, useMemo } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { useParams, useNavigate } from 'react-router-dom';
import { tables, reducers } from '../module_bindings';
import { useSpacetimeError } from '../SpacetimeDBProvider';


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

// --- SVG Icons ---
const IconLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconArrowDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
  </svg>
);

const IconArrowUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
);

// --- Component ---
export const SettingsScreen = () => {
  const { isActive: connected, connectionError } = useSpacetimeDB();
  const { lastError } = useSpacetimeError();
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

  // PIN countdown timer state
  const [pinSecondsLeft, setPinSecondsLeft] = useState<number>(0);

  // Toast state for new pairing notification
  const [newPairingToast, setNewPairingToast] = useState<string | null>(null);

  // Track previously-known device count to detect newly paired venues
  const [prevDeviceIds, setPrevDeviceIds] = useState<Set<string>>(new Set());

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
    // Suppress unused warning — displays would be populated via IPC in production
    setDisplays(d => d);
  }, []);

  const activePin = useMemo(() => {
    const pin = pins.find(p => p.messengerUid === machineUid);
    console.log("Settings: Checking for active PIN", { machineUid, pins, found: !!pin });
    return pin;
  }, [pins, machineUid]);

  // This device's registration entries
  const myDevices = devices.filter(d => d.uid === machineUid);
  const hasPairedVenues = myDevices.length > 0;

  // Build full log list (last 50 messages, newest first)
  // Filtered to only messages from venues that this device is paired with
  const pairedVenueIds = useMemo(() => new Set(myDevices.map(d => d.venueId)), [myDevices]);
  const pairedChannelIds = useMemo(() => new Set(
    channels.filter(c => pairedVenueIds.has(c.venueId)).map(c => c.channelId)
  ), [channels, pairedVenueIds]);

  const logList = useMemo(() => [...messages]
    .filter(m => pairedChannelIds.has(m.channelId))
    .sort((a, b) => Number(b.sentAt.microsSinceUnixEpoch - a.sentAt.microsSinceUnixEpoch))
    .slice(0, 50), [messages, pairedChannelIds]);

  const getVenueName = (id: bigint) => venues.find(v => v.venueId === id)?.name ?? `Venue #${id}`;
  const getTemplateName = (id?: bigint | null) =>
    id ? (templates.find(t => t.templateId === id)?.name ?? `Template #${id}`) : 'Manual';
  const getUserName = (id: bigint) => users.find(u => u.userId === id)?.name ?? `User #${id}`;
  const getStatus = (messageId: any, deviceId: any) => {
    const mid = BigInt(messageId);
    const did = BigInt(deviceId);
    const s = Array.from(deliveryStatuses || []).find(ds => BigInt(ds.messageId) === mid && BigInt(ds.messengerId) === did);
    return s?.status?.tag;
  };

  // Heartbeat is handled in App.tsx

  // PIN expiry countdown — tick every second
  useEffect(() => {
    if (!activePin) {
      setPinSecondsLeft(0);
      return;
    }
    const update = () => {
      const nowMs = Date.now();
      const expiryMs = Number(activePin.expiresAt.microsSinceUnixEpoch / 1000n);
      const remaining = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));
      setPinSecondsLeft(remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activePin]);

  // Detect newly paired venues — compare device IDs
  useEffect(() => {
    if (machineUid.startsWith('Loading')) return;
    const currentIds = new Set(myDevices.map(d => d.messengerId.toString()));
    const newIds = [...currentIds].filter(id => !prevDeviceIds.has(id));
    if (newIds.length > 0 && prevDeviceIds.size > 0) {
      // A new device was just added — find the venue name
      const newDevice = myDevices.find(d => newIds.includes(d.messengerId.toString()));
      const venueName = newDevice ? getVenueName(newDevice.venueId) : 'a venue';
      setNewPairingToast(`Paired with "${venueName}" as "${newDevice?.name}"`);
      // Auto-dismiss after 6s
      setTimeout(() => setNewPairingToast(null), 6000);
    }
    setPrevDeviceIds(currentIds);
  }, [myDevices.length]);


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

  const handleShowSample = () => {
    // Clear first to ensure the storage event fires even if the value is the same
    localStorage.removeItem('test_message');
    setTimeout(() => {
      localStorage.setItem('test_message', 'Sample Message: Testing ticker settings! (' + new Date().toLocaleTimeString() + ')');
    }, 10);
  };

  const TAB_CONFIG: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'pairing', label: 'Pairing', icon: <IconLink /> },
    { id: 'logs', label: 'Log', icon: <IconList /> },
    { id: 'settings', label: 'Settings', icon: <IconSettings /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0B0E14', color: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Courier Display</span>

          {/* DB connection status — independent */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '20px', padding: '3px 10px 3px 8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#10B981' : '#EF4444', boxShadow: `0 0 5px ${connected ? '#10B981' : '#EF4444'}`, flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: connected ? '#10B981' : '#EF4444' }}>
              {connected ? 'DB Connected' : 'DB Offline'}
            </span>
          </div>

          {/* Venue pairing badge — separate */}
          {machineUid !== 'Loading...' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${hasPairedVenues ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '20px', padding: '3px 10px 3px 8px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: hasPairedVenues ? '#818CF8' : '#475569', flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: hasPairedVenues ? '#818CF8' : '#64748B' }}>
                {hasPairedVenues ? `${myDevices.length} venue${myDevices.length !== 1 ? 's' : ''} paired` : 'No venues'}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {TAB_CONFIG.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => navigate(`/settings/${id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                background: activeTab === id ? '#3B82F6' : 'rgba(255,255,255,0.06)',
                color: activeTab === id ? '#fff' : '#94A3B8',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontWeight: activeTab === id ? 600 : 400,
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

        {/* === PAIRING TAB === */}
        {activeTab === 'pairing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '560px', margin: '0 auto' }}>

            {/* New Pairing Toast */}
            {newPairingToast && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: '12px', padding: '12px 16px',
                animation: 'fadeIn 0.3s ease',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span style={{ fontSize: '0.88rem', color: '#10B981', fontWeight: 500 }}>{newPairingToast}</span>
                <button onClick={() => setNewPairingToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#10B981', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>✕</button>
              </div>
            )}
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            {/* Status Card */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Connection Status</h3>
                <span style={{
                  fontSize: '0.8rem', padding: '3px 10px', borderRadius: '12px', fontWeight: 600,
                  background: connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: connected ? '#10B981' : '#EF4444',
                  border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {connected ? '● Connected' : '● Disconnected'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  <span style={{ color: '#94A3B8' }}>URI: </span>
                  <span style={{ fontFamily: 'monospace' }}>{localStorage.getItem('spacetime_uri') || 'ws://127.0.0.1:3000'}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', wordBreak: 'break-all' }}>
                  <span style={{ color: '#94A3B8' }}>Device ID: </span>
                  <span style={{ fontFamily: 'monospace' }}>{machineUid}</span>
                </div>
              </div>
            </div>

            {/* Connected Venues */}
            {myDevices.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', margin: '0 0 12px' }}>Paired Venues</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {myDevices.map(device => (
                    <div key={device.messengerId.toString()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{getVenueName(device.venueId)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>as "{device.name}"</div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>Active</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pair New Venue */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '8px', margin: '0 0 8px' }}>Register with a New Venue</h3>
              <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '20px', lineHeight: 1.5, margin: '0 0 20px' }}>
                Generate a 6-digit PIN, then enter it in the Web Dashboard under{' '}
                <strong style={{ color: '#F8FAFC' }}>Venue → Desktop Displays → Add Node</strong>.
              </p>

              {activePin ? (
                <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(59,130,246,0.08)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '8px' }}>Enter this PIN in the Web Dashboard:</div>
                  <div style={{ fontSize: '3rem', letterSpacing: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#3B82F6' }}>
                    {activePin.pin}
                  </div>
                  <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    {/* Countdown ring */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={pinSecondsLeft < 60 ? '#F59E0B' : '#64748b'} strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={{ fontSize: '0.8rem', color: pinSecondsLeft < 60 ? '#F59E0B' : '#64748b', fontWeight: 600, fontFamily: 'monospace' }}>
                      {pinSecondsLeft > 0
                        ? `${Math.floor(pinSecondsLeft / 60)}:${String(pinSecondsLeft % 60).padStart(2, '0')} remaining`
                        : 'PIN expired — generate a new one'}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  {!connected && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span style={{ fontSize: '0.8rem', color: '#EF4444' }}>Not connected to database — check Settings → SpacetimeDB Connection</span>
                    </div>
                  )}
                  {connected && (!machineUid || machineUid === 'Loading...') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Waiting for device ID…</span>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      console.log("Settings: Requesting PIN for", machineUid);
                      try {
                        await requestPin({ messengerUid: machineUid });
                        console.log("Settings: PIN request sent successfully");
                      } catch (err) {
                        console.error("Settings: Failed to request PIN", err);
                      }
                    }}
                    disabled={!machineUid || machineUid === 'Loading...' || !connected}
                    style={{ width: '100%', padding: '12px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: (!machineUid || machineUid === 'Loading...' || !connected) ? 'not-allowed' : 'pointer', opacity: (!connected || !machineUid || machineUid === 'Loading...') ? 0.4 : 1, transition: 'opacity 0.2s' }}
                  >
                    Generate Pairing PIN
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === LOGS TAB === */}
        {activeTab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>

            {/* Status row */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Database</div>
                <span style={{
                  fontSize: '0.8rem', padding: '3px 10px', borderRadius: '12px', fontWeight: 600,
                  background: connected ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                  color: connected ? '#10B981' : '#EF4444',
                  border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {connected ? '● Connected' : '● Offline'}
                </span>
              </div>

              <div style={{ flex: 2, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Paired Venues</div>
                {myDevices.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {myDevices.map(device => (
                      <span key={device.messengerId.toString()} style={{ fontSize: '0.8rem', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)', color: '#818CF8', padding: '2px 10px', borderRadius: '10px', fontWeight: 500 }}>
                        {getVenueName(device.venueId)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>None</span>
                )}
              </div>
            </div>

            {/* Connection error debug panel */}
            {connectionError && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Connection Error</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#FCA5A5', wordBreak: 'break-all', lineHeight: 1.5 }}>
                  {connectionError.message}
                </div>
                {connectionError.stack && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ fontSize: '0.72rem', color: '#EF4444', cursor: 'pointer', userSelect: 'none' }}>Stack trace</summary>
                    <pre style={{ fontSize: '0.7rem', color: '#7F1D1D', marginTop: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{connectionError.stack}</pre>
                  </details>
                )}
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#94A3B8' }}>
                  URI: <code style={{ fontFamily: 'monospace', color: '#F8FAFC' }}>{(localStorage.getItem('spacetime_uri') || 'ws://127.0.0.1:3000').replace('://localhost', '://127.0.0.1')}</code>
                  {' · '}DB: <code style={{ fontFamily: 'monospace', color: '#F8FAFC' }}>{localStorage.getItem('spacetime_db') || 'spacetimedb-node-project-gybhi'}</code>
                </div>
                {(localStorage.getItem('spacetime_uri') || '').includes('localhost') && (
                  <button
                    onClick={() => {
                      localStorage.setItem('spacetime_uri', (localStorage.getItem('spacetime_uri') || '').replace('://localhost', '://127.0.0.1'));
                      window.location.reload();
                    }}
                    style={{ marginTop: '10px', padding: '6px 12px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Fix: Replace localhost → 127.0.0.1 &amp; Reload
                  </button>
                )}
                {localStorage.getItem('auth_token') && (
                  <button
                    onClick={() => {
                      localStorage.removeItem('auth_token');
                      window.location.reload();
                    }}
                    style={{ marginTop: '10px', marginLeft: '8px', padding: '6px 12px', background: '#64748B', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Reset Auth Token
                  </button>
                )}
              </div>
            )}

            {/* Message list */}
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>Recent Messages</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 24px', color: '#64748b' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 16px', opacity: 0.4 }}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                  <h3 style={{ color: '#475569', margin: '0 0 8px' }}>No Messages Yet</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Messages from paired venues will appear here.</p>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0', color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                          {msgDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                      )}
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(59,130,246,0.5)', borderRadius: '12px', padding: '12px 16px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace' }}>{msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span style={{ color: '#334155' }}>·</span>
                          {venue && <span style={{ color: '#94A3B8', fontWeight: 500 }}>{venue.name}</span>}
                          {channel && <><span style={{ color: '#334155' }}>›</span><span style={{ color: '#94A3B8' }}>{channel.name}</span></>}
                          <span style={{ color: '#334155' }}>·</span>
                          <span>{getTemplateName(msg.templateId)}</span>
                          <span style={{ color: '#334155' }}>·</span>
                          <span>by {getUserName(msg.senderId)}</span>
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.4, color: '#F1F5F9', wordBreak: 'break-word' }}>
                          {msg.content}
                        </div>
                        {myDevices.length > 0 && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {myDevices.map(d => {
                              const status = getStatus(msg.messageId, d.messengerId);
                              const statusColor = status === 'Shown' ? '#10B981' : status === 'InProgress' ? '#3B82F6' : status === 'Queued' ? '#64748b' : '#334155';
                              const statusLabel = status === 'Shown' ? 'Shown' : status === 'InProgress' ? 'In Progress' : status === 'Queued' ? 'Queued' : 'Unknown';
                              return (
                                <span key={d.messengerId.toString()} style={{ fontSize: '0.7rem', color: statusColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                                  {d.name}: {statusLabel}
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
            <section style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>SpacetimeDB Connection</h3>
                <button
                  onClick={handleSaveSpacetimeSettings}
                  style={{ padding: '6px 14px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save & Reload
                </button>
              </div>

              <label style={labelStyle}>Host URI</label>
              <input
                type="text"
                value={stUri}
                onChange={e => setStUri(e.target.value)}
                style={inputStyle}
                placeholder="ws://127.0.0.1:3000"
              />
              <p style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '6px' }}>
                Restart the app to apply URI changes.
              </p>

              <label style={{ ...labelStyle, marginTop: '16px' }}>Database Name</label>
              <input
                type="text"
                value={stDb}
                onChange={e => setStDb(e.target.value)}
                style={inputStyle}
                placeholder="spacetimedb-node-project-gybhi"
              />
            </section>

            {/* Display & Position */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px', margin: '0 0 16px' }}>Display &amp; Position</h3>

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
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}
                  >
                    {pos === 'bottom' ? <IconArrowDown /> : <IconArrowUp />}
                    {pos === 'bottom' ? 'Bottom' : 'Top'}
                  </button>
                ))}
              </div>
            </section>

            {/* Typography */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px', margin: '0 0 16px' }}>Typography</h3>

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
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 16px' }}>Colors</h3>

              <div style={{ display: 'flex', gap: '16px' }}>
                {/* Text Color */}
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Text Color</label>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', cursor: 'pointer',
                  }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: tickerSettings.fgColor,
                      border: '2px solid rgba(255,255,255,0.15)',
                      flexShrink: 0, position: 'relative', overflow: 'hidden',
                    }}>
                      <input
                        type="color"
                        value={tickerSettings.fgColor}
                        onChange={e => updateTickerSetting('fgColor', e.target.value)}
                        style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'monospace' }}>{tickerSettings.fgColor}</span>
                  </label>
                </div>

                {/* Background Color */}
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Background Color</label>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px', padding: '10px 14px', cursor: 'pointer',
                  }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: tickerSettings.bgColor,
                      border: '2px solid rgba(255,255,255,0.15)',
                      flexShrink: 0, position: 'relative', overflow: 'hidden',
                      backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                    }}>
                      <div style={{ position: 'absolute', inset: 0, background: tickerSettings.bgColor }} />
                      <input
                        type="color"
                        value={tickerSettings.bgColor.startsWith('rgba') ? '#000000' : tickerSettings.bgColor}
                        onChange={e => updateTickerSetting('bgColor', e.target.value)}
                        style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
                      />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'monospace' }}>{tickerSettings.bgColor}</span>
                  </label>
                </div>
              </div>
            </section>

            {/* Scroll & Repeat */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 16px' }}>Playback</h3>

              <label style={labelStyle}>Scroll Speed ({tickerSettings.scrollSpeed}s per pass)</label>
              <input
                type="range" min={5} max={60} step={1}
                value={tickerSettings.scrollSpeed}
                onChange={e => updateTickerSetting('scrollSpeed', parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#3B82F6', marginBottom: '4px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#475569' }}>
                <span>Fast (5s)</span><span>Slow (60s)</span>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Repeat Each Message</label>
                  <input
                    type="number" min={1} max={10}
                    value={tickerSettings.repeatCount}
                    onChange={e => updateTickerSetting('repeatCount', parseInt(e.target.value))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', paddingTop: '22px' }}>times</div>
              </div>
            </section>

            {/* Preview */}
            <section style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Preview</h3>
                <button
                  onClick={handleShowSample}
                  style={{ 
                    padding: '6px 12px', background: 'rgba(59,130,246,0.15)', color: '#3B82F6', 
                    border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', 
                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Display Test Message
                </button>
              </div>
              <div style={{ borderRadius: '8px', overflow: 'hidden', height: '64px', display: 'flex', alignItems: 'center', background: tickerSettings.bgColor, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ paddingLeft: '100%', animation: `marquee ${tickerSettings.scrollSpeed}s linear infinite`, fontFamily: tickerSettings.fontFamily, fontSize: `${Math.min(tickerSettings.fontSize, 32)}px`, fontWeight: tickerSettings.fontWeight, color: tickerSettings.fgColor, whiteSpace: 'nowrap' }}>
                  Sample: Welcome to Courier Notifications!
                </div>
              </div>
              <style>{`@keyframes marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-150%) } }`}</style>
            </section>

            {/* Display SpacetimeDB Error */}
            {lastError && (
              <section style={{ ...sectionStyle, borderColor: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>
                <h3 style={{ fontSize: '1rem', margin: '0 0 16px', color: '#EF4444' }}>SpacetimeDB Connection Error</h3>
                <p style={{ fontSize: '0.85rem', color: '#FCA5A5', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {lastError.message}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#FCA5A5', marginTop: '8px' }}>
                  If you see a 403 error, your identity might be invalid. Resetting identity and data might help.
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '20px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  color: '#94A3B8',
  marginBottom: '6px',
  fontWeight: 600,
  letterSpacing: '0.06em',
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
  boxSizing: 'border-box',
};

// --- ICONS ---

