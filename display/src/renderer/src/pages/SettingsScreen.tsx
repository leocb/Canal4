import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, ArrowRight, Languages } from 'lucide-react';
import { useTable, useReducer } from 'spacetimedb/react';
import { useParams, useNavigate } from 'react-router-dom';
import { tables, reducers } from '../module_bindings';
import { useConnectivity } from '../SpacetimeDBProvider';
import { useTranslation } from 'react-i18next';


type Tab = 'logs' | 'pairing' | 'settings';

// --- Ticker Settings (persisted to localStorage) ---
export interface TickerSettings {
  position: 'top' | 'bottom';
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  bgColor: string;
  fgColor: string;
  scrollSpeed: number; // pixels per second
  repeatCount: number;
}

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  position: 'bottom',
  fontFamily: 'monospace',
  fontSize: 28,
  fontWeight: '600',
  bgColor: 'rgba(0,0,0,0.4)',
  fgColor: '#ffffff',
  scrollSpeed: 150,
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

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

function parseColorToHexAlpha(color: string): { hex: string; alpha: number } {
  if (color.startsWith('rgba')) {
    const parts = color.match(/[\d.]+/g);
    if (parts && parts.length === 4) {
      const r = parseInt(parts[0]);
      const g = parseInt(parts[1]);
      const b = parseInt(parts[2]);
      const a = parseFloat(parts[3]);
      const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
      return { hex, alpha: a };
    }
  } else if (color.startsWith('#')) {
    // Basic hex support
    if (color.length === 7) return { hex: color, alpha: 1 };
    if (color.length === 4) {
      const r = color[1] + color[1];
      const g = color[2] + color[2];
      const b = color[3] + color[3];
      return { hex: `#${r}${g}${b}`, alpha: 1 };
    }
  }
  return { hex: '#000000', alpha: 1 };
}

function hexAlphaToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Component ---
export const SettingsScreen = () => {
  const { t, i18n } = useTranslation();
  const {
    status,
    error: connectionError,
    reconnect,
    heartbeatError,
    nextRetryIn,
    stUri,
    setStUri,
    stDb,
    setStDb
  } = useConnectivity();
  const connected = status === 'online';
  const [messages] = useTable(tables.Message);
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [templates] = useTable(tables.MessageTemplate);
  const [devices] = useTable(tables.DisplayDevice);
  const [users] = useTable(tables.User);
  const [deliveryStatuses] = useTable(tables.MessageDeliveryStatus);

  const [machineUid, setMachineUid] = useState<string>('Loading...');
  const [pins] = useTable(tables.DisplayPairingPin);
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab: Tab = (tab as Tab) || 'pairing';
  const [tickerSettings, setTickerSettingsState] = useState<TickerSettings>(loadTickerSettings());
  const [showLangMenu, setShowLangMenu] = useState(false);

  const [tempStUri, setTempStUri] = useState(stUri);
  const [tempStDb, setTempStDb] = useState(stDb);

  // Sync temp state if context changes externally (e.g. initial load)
  useEffect(() => {
    setTempStUri(stUri);
    setTempStDb(stDb);
  }, [stUri, stDb]);

  // Ticker position settings IPC
  const [displays, setDisplays] = useState<{ id: number; label: string }[]>([{ id: 0, label: 'Primary Display' }]);
  const [selectedDisplay, setSelectedDisplay] = useState<number>(
    parseInt(localStorage.getItem('ticker_display') || '0', 10)
  );

  const previewRef = useRef<HTMLDivElement>(null);
  const [previewDuration, setPreviewDuration] = useState(10);

  const requestPin = useReducer(reducers.createDisplayPin);
  const unpair = useReducer(reducers.unpairDisplay);

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
    const pin = pins.find(p => p.displayUid === machineUid);
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

  const getVenueName = (id: bigint) => venues.find(v => v.venueId === id)?.name ?? t('common.venue_default_name', { id: id.toString() });
  const getTemplateName = (id?: bigint | null) =>
    id ? (templates.find(t => t.templateId === id)?.name ?? t('common.template_default_name', { id: id.toString() })) : t('settings.logs.manual');
  const getUserName = (id: bigint) => users.find(u => u.userId === id)?.name ?? t('common.user_default_name', { id: id.toString() });
  const getStatus = (messageId: any, deviceId: any) => {
    const mid = BigInt(messageId);
    const did = BigInt(deviceId);
    const s = Array.from(deliveryStatuses || []).find(ds => BigInt(ds.messageId) === mid && BigInt(ds.displayId) === did);
    return s?.status?.tag;
  };

  const getMessageBorderColor = (messageId: bigint, venueId?: bigint | null) => {
    const myIds = myDevices
      .filter(d => !venueId || d.venueId === venueId)
      .map(d => BigInt(d.displayId));

    if (myIds.length === 0) return 'rgba(59,130,246,0.5)';

    const statuses = myIds.map(did => getStatus(messageId, did)).filter(s => !!s);

    if (statuses.length === 0) return 'rgba(59,130,246,0.5)';

    if (statuses.some(s => s === 'InProgress')) return '#3B82F6';
    if (statuses.some(s => s === 'Unavailable' || s === 'Skipped')) return '#F59E0B';
    if (statuses.every(s => s === 'Cancelled')) return '#EF4444';
    if (statuses.every(s => s === 'Shown')) return '#10B981';
    if (statuses.some(s => s === 'Queued')) return '#94A3B8';

    return 'rgba(59,130,246,0.5)';
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
    const currentIds = new Set(myDevices.map(d => d.displayId.toString()));
    const newIds = [...currentIds].filter(id => !prevDeviceIds.has(id));
    if (newIds.length > 0 && prevDeviceIds.size > 0) {
      // A new device was just added — find the venue name
      const newDevice = myDevices.find(d => newIds.includes(d.displayId.toString()));
      const venueName = newDevice ? getVenueName(newDevice.venueId) : t('common.venue_default_name', { id: '?' });
      setNewPairingToast(t('settings.pairing.toast_success', { venue: venueName, name: newDevice?.name }));
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

  useEffect(() => {
    if (previewRef.current) {
      const width = previewRef.current.scrollWidth;
      const duration = width / tickerSettings.scrollSpeed;
      setPreviewDuration(duration);
    }
  }, [tickerSettings.scrollSpeed, tickerSettings.fontSize, tickerSettings.fontFamily]);

  const FONT_OPTIONS = [
    { value: 'monospace', label: t('settings.display.font_monospace') },
    { value: 'Inter, sans-serif', label: t('settings.display.font_inter') },
    { value: 'Georgia, serif', label: t('settings.display.font_georgia') },
    { value: 'Impact, sans-serif', label: t('settings.display.font_impact') },
    { value: 'Courier New, monospace', label: t('settings.display.font_courier') },
  ];

  const handleSaveSpacetimeSettings = () => {
    setStUri(tempStUri);
    setStDb(tempStDb);
    reconnect();
  };

  const handleShowSample = () => {
    localStorage.removeItem('test_message');
    setTimeout(() => {
      localStorage.setItem('test_message', t('settings.display.test_message_sample', { time: new Date().toLocaleTimeString() }));
    }, 10);
  };

  const TAB_CONFIG: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'pairing', label: t('settings.tabs.pairing'), icon: <IconLink /> },
    { id: 'logs', label: t('settings.tabs.logs'), icon: <IconList /> },
    { id: 'settings', label: t('settings.tabs.settings'), icon: <IconSettings /> },
  ];

  return (
    <div className="premium-bg" style={{ display: 'flex', flexDirection: 'column', height: '100vh', color: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Row 1: Header — app name + status badges on left, language selector on right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{t('app.desktop_name')}</span>

          {/* DB connection status — independent */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            borderRadius: '20px',
            padding: '3px 10px 3px 8px'
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: connected ? '#10B981' : (status === 'error') ? '#EF4444' : '#F59E0B',
              boxShadow: `0 0 5px ${connected ? '#10B981' : (status === 'error') ? '#EF4444' : '#F59E0B'}`,
              flexShrink: 0
            }} />
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: connected ? '#10B981' : (status === 'error') ? '#EF4444' : '#F59E0B'
            }}>
              {connected ? t('settings.connection.status_connected') :
                (nextRetryIn > 0) ?
                  (status === 'error' ? `${t('settings.connection.status_offline')} ${nextRetryIn}s` : `${t('common.connecting')} (${nextRetryIn}s)`) :
                  t('settings.connection.status_offline')}
            </span>
          </div>

          {/* Venue pairing badge — separate */}
          {machineUid !== 'Loading...' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${hasPairedVenues ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '20px', padding: '3px 10px 3px 8px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: hasPairedVenues ? '#818CF8' : '#475569', flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: hasPairedVenues ? '#818CF8' : '#64748B' }}>
                {hasPairedVenues ? t('settings.pairing.paired_venues_count', { count: myDevices.length, defaultValue: `${myDevices.length} venues paired` }) : t('settings.pairing.no_venues')}
              </span>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowLangMenu(m => !m)}
            title={t('common.language')}
            style={{ padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', cursor: 'pointer' }}
          >
            <Languages size={16} />
          </button>
          {showLangMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowLangMenu(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: '160px', zIndex: 1000, background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '4px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}>
                {([['en', t('settings.languages.en')], ['pt-BR', t('settings.languages.pt-BR')]] as const).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => { i18n.changeLanguage(code); setShowLangMenu(false); }}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '6px', background: i18n.language === code ? 'rgba(59,130,246,0.15)' : 'transparent', color: i18n.language === code ? '#3B82F6' : '#94A3B8', border: 'none', cursor: 'pointer', fontSize: '0.85rem', display: 'block' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Tab Bar — centered tabs, full width */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)', flexShrink: 0, gap: '4px' }}>
        {TAB_CONFIG.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => navigate(`/settings/${id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 20px',
              fontSize: '0.82rem',
              borderRadius: '8px',
              background: activeTab === id ? '#3B82F6' : 'transparent',
              color: activeTab === id ? '#fff' : '#64748B',
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
                <X size={18} onClick={() => setNewPairingToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#10B981', cursor: 'pointer', padding: 0, transform: 'translateY(1px)' }} />
              </div>
            )}
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>


            {/* Connected Venues */}
            {myDevices.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', margin: '0 0 12px' }}>{t('settings.pairing.paired_venues')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {myDevices.map(device => (
                    <div key={device.displayId.toString()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{getVenueName(device.venueId)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{t('settings.pairing.as_name', { name: device.name })}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => {
                            if (window.confirm(t('settings.pairing.unpair_confirm', { name: getVenueName(device.venueId) }))) {
                              unpair({ displayId: device.displayId });
                            }
                          }}
                          title={t('settings.display.delete_node')}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            padding: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pair New Venue */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '8px', margin: '0 0 8px' }}>{t('settings.pairing.register_new')}</h3>
              <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '20px', lineHeight: 1.5, margin: '0 0 20px' }}>
                {t('settings.pairing.register_helper')}{' '}
                <strong style={{ color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {t('settings.pairing.register_path').split('>').map((part, i, arr) => (
                    <React.Fragment key={i}>
                      {part.trim()}
                      {i < arr.length - 1 && <ArrowRight size={12} style={{ transform: 'translateY(1px)' }} />}
                    </React.Fragment>
                  ))}
                </strong>
              </p>


              {activePin ? (
                <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(59,130,246,0.08)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '8px' }}>{t('settings.pairing.enter_pin_helper')}</div>
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
                        ? t('settings.pairing.pin_remaining', { time: `${Math.floor(pinSecondsLeft / 60)}:${String(pinSecondsLeft % 60).padStart(2, '0')}` })
                        : t('settings.pairing.pin_expired')}
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
                      <span style={{ fontSize: '0.8rem', color: '#EF4444' }}>{t('settings.pairing.not_connected_error')}</span>
                    </div>
                  )}
                  {connected && (!machineUid || machineUid === 'Loading...') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{t('settings.connection.waiting_device_id')}</span>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      console.log("Settings: Requesting PIN for", machineUid);
                      try {
                        await requestPin({ displayUid: machineUid });
                        console.log("Settings: PIN request sent successfully");
                      } catch (err) {
                        console.error("Settings: Failed to request PIN", err);
                      }
                    }}
                    disabled={!machineUid || machineUid === 'Loading...' || !connected}
                    style={{ width: '100%', padding: '12px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, cursor: (!machineUid || machineUid === 'Loading...' || !connected) ? 'not-allowed' : 'pointer', opacity: (!connected || !machineUid || machineUid === 'Loading...') ? 0.4 : 1, transition: 'opacity 0.2s' }}
                  >
                    {t('settings.pairing.generate_pin')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === LOGS TAB === */}
        {activeTab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>

            {/* Message list */}
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>{t('settings.logs.title')}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 24px', color: '#64748b' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 16px', opacity: 0.4 }}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                  <h3 style={{ color: '#475569', margin: '0 0 8px' }}>{t('settings.logs.no_messages')}</h3>
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>{t('settings.logs.no_messages_helper')}</p>
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
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${getMessageBorderColor(msg.messageId, venue?.venueId)}`, borderRadius: '12px', padding: '12px 16px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace' }}>{msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span style={{ color: '#334155' }}>·</span>
                          {venue && <span style={{ color: '#94A3B8', fontWeight: 500 }}>{venue.name}</span>}
                          {channel && <><span style={{ color: '#334155' }}>›</span><span style={{ color: '#94A3B8' }}>{channel.name}</span></>}
                          <span style={{ color: '#334155' }}>·</span>
                          <span>{getTemplateName(msg.templateId)}</span>
                          <span style={{ color: '#334155' }}>·</span>
                          <span>{t('settings.logs.by_user', { name: getUserName(msg.senderId) })}</span>
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.4, color: '#F1F5F9', wordBreak: 'break-word' }}>
                          {msg.content}
                        </div>
                        {myDevices.length > 0 && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {myDevices
                              .filter(d => venue && d.venueId === venue.venueId)
                              .map(d => {
                                const status = getStatus(msg.messageId, d.displayId);
                                if (!status) return null;

                                const statusColor =
                                  status === 'Shown' ? '#10B981' :
                                    status === 'InProgress' ? '#3B82F6' :
                                      status === 'Queued' ? '#94A3B8' :
                                        status === 'Skipped' ? '#F59E0B' :
                                          status === 'Unavailable' ? '#F59E0B' :
                                            status === 'Cancelled' ? '#EF4444' : '#334155';
                                const statusLabel =
                                  status === 'Shown' ? t('settings.logs.status.shown') :
                                    status === 'InProgress' ? t('settings.logs.status.in_progress') :
                                      status === 'Queued' ? t('settings.logs.status.queued') :
                                        status === 'Skipped' ? t('settings.logs.status.skipped') :
                                          status === 'Unavailable' ? t('settings.logs.status.unavailable') :
                                            status === 'Cancelled' ? t('settings.logs.status.deleted') : status;
                                return (
                                  <span key={d.displayId.toString()} style={{ fontSize: '0.7rem', color: statusColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '560px', margin: '0 auto', paddingBottom: '40px' }}>


            {/* SpacetimeDB Connection */}
            <section style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('settings.connection.title')}</h3>
                <button
                  onClick={handleSaveSpacetimeSettings}
                  style={{ padding: '6px 14px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('settings.connection.save_reload')}
                </button>
              </div>

              {/* Connection error — shown at top when there's an error */}

              <label style={labelStyle}>{t('settings.connection.host_uri')}</label>
              <input
                type="text"
                value={tempStUri}
                onChange={e => setTempStUri(e.target.value)}
                style={inputStyle}
                placeholder="ws://127.0.0.1:3000"
              />

              <label style={{ ...labelStyle, marginTop: '16px' }}>{t('settings.connection.db_name')}</label>
              <input
                type="text"
                value={tempStDb}
                onChange={e => setTempStDb(e.target.value)}
                style={inputStyle}
                placeholder="canal4-dev"
              />

              <div style={{ marginTop: '20px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8' }}>{t('settings.connection.device_id')}</span>
                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b' }}>{machineUid}</span>
              </div>

              {/* Advanced Error & Auth Reset Panel */}
              {(connectionError || heartbeatError) && (
                <div style={{ marginTop: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{t('settings.connection.error_title')}</div>

                  {connectionError && (
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#FCA5A5', wordBreak: 'break-all', lineHeight: 1.5, marginBottom: heartbeatError ? '12px' : 0 }}>
                      {t(connectionError.message)}
                      {connectionError.stack && (
                        <details style={{ marginTop: '8px' }}>
                          <summary style={{ fontSize: '0.72rem', color: '#EF4444', cursor: 'pointer', userSelect: 'none' }}>{t('settings.connection.stack_trace')}</summary>
                          <pre style={{ fontSize: '0.7rem', color: '#7F1D1D', marginTop: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{connectionError.stack}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {heartbeatError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span style={{ fontSize: '0.8rem', color: '#EF4444', fontWeight: 500 }}>
                        {t(heartbeatError.startsWith('api_errors.') ? heartbeatError : `api_errors.${heartbeatError}`, { defaultValue: heartbeatError })}
                      </span>
                    </div>
                  )}

                  {/* Reset Identity Button — renamed from Reset Auth for clarity */}
                  {(localStorage.getItem('auth_token') || heartbeatError || status === 'error') && (
                    <div style={{ marginTop: '16px' }}>
                      <button
                        onClick={async () => {
                          if (window.confirm(t('settings.connection.reset_confirm'))) {
                            // @ts-ignore
                            if (window.api?.resetIdentity) {
                              await window.api.resetIdentity();
                            } else {
                              localStorage.removeItem('auth_token');
                              // @ts-ignore
                              if (window.api?.setToken) window.api.setToken('');
                              window.location.reload();
                            }
                          }
                        }}
                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.color = '#EF4444';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                          e.currentTarget.style.color = '#94A3B8';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        }}
                      >
                        {t('settings.connection.reset_auth')}
                      </button>
                      <p style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '10px', lineHeight: 1.5 }}>
                        {t('settings.connection.reset_helper')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Display & Position */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px', margin: '0 0 16px' }}>{t('settings.display.screen_position')}</h3>

              <label style={labelStyle}>{t('settings.display.monitor')}</label>
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

              <label style={{ ...labelStyle, marginTop: '14px' }}>{t('settings.display.screen_position')}</label>
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
                    {pos === 'bottom' ? t('settings.display.bottom') : t('settings.display.top')}
                  </button>
                ))}
              </div>
            </section>

            {/* Typography */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', marginBottom: '16px', margin: '0 0 16px' }}>{t('settings.display.typography')}</h3>

              <label style={labelStyle}>{t('settings.display.font')}</label>
              <select
                value={tickerSettings.fontFamily}
                onChange={e => updateTickerSetting('fontFamily', e.target.value)}
                style={selectStyle}
              >
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>

              <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('settings.display.font_size')}</label>
                  <input
                    type="number" min={12} max={80}
                    value={tickerSettings.fontSize}
                    onChange={e => updateTickerSetting('fontSize', parseInt(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('settings.display.font_weight')}</label>
                  <select
                    value={tickerSettings.fontWeight}
                    onChange={e => updateTickerSetting('fontWeight', e.target.value as TickerSettings['fontWeight'])}
                    style={selectStyle}
                  >
                    <option value="400">{t('settings.display.font_weight_regular')}</option>
                    <option value="600">{t('settings.display.font_weight_semibold')}</option>
                    <option value="700">{t('settings.display.font_weight_bold')}</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Colors */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 16px' }}>{t('settings.display.colors')}</h3>

              <div style={{ display: 'flex', gap: '16px' }}>
                {/* Text Color */}
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('settings.display.fg_color')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                          value={parseColorToHexAlpha(tickerSettings.fgColor).hex}
                          onChange={e => {
                            const { alpha } = parseColorToHexAlpha(tickerSettings.fgColor);
                            updateTickerSetting('fgColor', hexAlphaToRgba(e.target.value, alpha));
                          }}
                          style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
                        />
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'monospace' }}>{tickerSettings.fgColor}</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, width: '36px' }}>{t('settings.display.alpha')}</span>
                      <input
                        type="range" min={0} max={1} step={0.01}
                        value={parseColorToHexAlpha(tickerSettings.fgColor).alpha}
                        onChange={e => {
                          const { hex } = parseColorToHexAlpha(tickerSettings.fgColor);
                          updateTickerSetting('fgColor', hexAlphaToRgba(hex, parseFloat(e.target.value)));
                        }}
                        style={{ flex: 1, accentColor: '#3B82F6' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Background Color */}
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('settings.display.bg_color')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                          value={parseColorToHexAlpha(tickerSettings.bgColor).hex}
                          onChange={e => {
                            const { alpha } = parseColorToHexAlpha(tickerSettings.bgColor);
                            updateTickerSetting('bgColor', hexAlphaToRgba(e.target.value, alpha));
                          }}
                          style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
                        />
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'monospace' }}>{tickerSettings.bgColor}</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, width: '36px' }}>{t('settings.display.alpha')}</span>
                      <input
                        type="range" min={0} max={1} step={0.01}
                        value={parseColorToHexAlpha(tickerSettings.bgColor).alpha}
                        onChange={e => {
                          const { hex } = parseColorToHexAlpha(tickerSettings.bgColor);
                          updateTickerSetting('bgColor', hexAlphaToRgba(hex, parseFloat(e.target.value)));
                        }}
                        style={{ flex: 1, accentColor: '#3B82F6' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Scroll & Repeat */}
            <section style={sectionStyle}>
              <h3 style={{ fontSize: '1rem', margin: '0 0 16px' }}>{t('settings.display.motion')}</h3>

              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{t('settings.display.scroll_speed')}</label>
                <input
                  type="range" min={10} max={300} step={5}
                  value={tickerSettings.scrollSpeed}
                  onChange={e => updateTickerSetting('scrollSpeed', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#3B82F6', marginBottom: '4px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#475569' }}>
                  <span>{t('settings.display.slow')} (10px/s)</span><span>{t('settings.display.fast')} (300px/s)</span>
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t('settings.display.repeat_count')}</label>
                  <input
                    type="number" min={1} max={10}
                    value={tickerSettings.repeatCount}
                    onChange={e => updateTickerSetting('repeatCount', parseInt(e.target.value))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', paddingTop: '22px' }}>{t('settings.display.times')}</div>
              </div>
            </section>

            {/* Preview */}
            <section style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('settings.display.preview')}</h3>
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
                  {t('settings.display.test_banner')}
                </button>
              </div>
              <div style={{ borderRadius: '8px', overflow: 'hidden', height: '64px', display: 'flex', alignItems: 'center', background: tickerSettings.bgColor, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div
                  ref={previewRef}
                  style={{
                    paddingLeft: '100%',
                    animation: `marquee ${previewDuration}s linear infinite`,
                    fontFamily: tickerSettings.fontFamily,
                    fontSize: `${Math.min(tickerSettings.fontSize, 32)}px`,
                    fontWeight: tickerSettings.fontWeight,
                    color: tickerSettings.fgColor,
                    whiteSpace: 'nowrap'
                  }}>
                  {t('settings.display.sample_text')}
                </div>
              </div>
              <style>{`@keyframes marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-100%) } }`}</style>
            </section>

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

