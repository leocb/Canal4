import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTable, useReducer } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings/index.ts';
import { ArrowLeft, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TemplateField {
  id: string; 
  name: string;
  prefix: string;
  suffix: string;
  regexPattern?: string;
  regexErrorMsg?: string;
  secondaryPrefix: string;
  secondarySuffix: string;
  secondaryRegexTrigger?: string;
  type?: string;        // NEW: text, number, date, time
  isRequired?: boolean; // NEW
  // Legacy
  isNumericOnly?: boolean;
  isOptional?: boolean;
}

export const SendMessageScreen = () => {
  const { t } = useTranslation();
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();

  const [venues] = useTable(tables.VenueView);
  const [channels] = useTable(tables.ChannelView);
  const [channelRoles] = useTable(tables.ChannelMemberRoleView);
  const [venueMembers] = useTable(tables.VenueMemberView);
  const [templates] = useTable(tables.MessageTemplateView);
  const [displayDevices] = useTable(tables.DisplayDeviceView);

  const sendMessage = useReducer(reducers.sendMessage);

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = channelId ? BigInt(channelId) : 0n;
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt);

  // Role resolution
  const myVenueMembership = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === user?.userId);
  const isBlocked = myVenueMembership?.isBlocked ?? false;

  const myChannelRole = channelRoles.find(
    r => r.channelId === channelIdBigInt && r.userId === user?.userId
  );

  const roleTag: string = isBlocked ? 'member' : (myChannelRole?.role.tag ?? 'member').toLowerCase();
  const isVenueOwner = !isBlocked && myVenueMembership?.role?.tag?.toLowerCase() === 'owner';
  const isOwner = isVenueOwner || roleTag === 'owner';
  const isAdmin = isOwner || roleTag === 'admin';
  const isModerator = isAdmin || roleTag === 'moderator';

  const channelTemplates = templates.filter(t => t.channelId === channelIdBigInt).sort((a, b) => a.name.localeCompare(b.name));
  const isNodeConnected = (device: any) => {
    if (!device.lastConnectedAt) return false;
    try {
      const lastActive = Number(BigInt(device.lastConnectedAt.microsSinceUnixEpoch) / 1000n);
      const now = Date.now();
      // Heartbeat is 5s, threshold is 17s
      return (now - lastActive) < 17000;
    } catch {
      return false;
    }
  };

  const hasActiveDevices = displayDevices
    .filter((d: any) => d.venueId === venue?.venueId)
    .some(isNodeConnected);

  const [selectedTemplateId, setSelectedTemplateId] = useState<bigint | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Skip select step if only 1 template
  useEffect(() => {
    if (channelTemplates.length === 1 && !selectedTemplateId) {
      setSelectedTemplateId(channelTemplates[0].templateId);
    }
  }, [channelTemplates, selectedTemplateId]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!isModerator) {
    return (
      <div className="app-container empty-state">
        <h2>{t('send_message.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('send_message.no_permission')}</p>
        <button onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  if (channelTemplates.length === 0) {
    return (
      <div className="app-container empty-state">
        <h2>{t('send_message.no_templates_title')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
          {t('send_message.no_templates_text')}
        </p>
        <button onClick={() => navigate(-1)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  const selectedTemplate = channelTemplates.find(t => t.templateId === selectedTemplateId);
  
  // Parse with backwards compatibility
  let parsedFields: TemplateField[] = [];
  let initialSuffix = '';
  let finalPrefix = '';
  
  if (selectedTemplate) {
    try {
      const parsed = JSON.parse(selectedTemplate.fieldsJson || '[]');
      if (Array.isArray(parsed)) {
        parsedFields = parsed;
      } else if (parsed && typeof parsed === 'object') {
        parsedFields = parsed.fields || [];
        initialSuffix = parsed.initialSuffix || '';
        finalPrefix = parsed.finalPrefix || '';
      }
    } catch (e) {
      console.error("Failed to parse template fields:", e);
    }
  }

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    
    // Immediate validation
    const field = parsedFields.find(f => f.id === fieldId);
    if (field) {
      let error = '';
      const isNumeric = field.type === 'number' || field.isNumericOnly;
      if (value && isNumeric && !/^\d+$/.test(value)) {
        error = t('send_message.field_numeric_only');
      } else if (value && field.regexPattern) {
        try {
          const rx = new RegExp(field.regexPattern);
          if (!rx.test(value)) {
            error = field.regexErrorMsg || t('send_message.field_invalid_format');
          }
        } catch (e) { }
      }
      setFieldErrors(prev => ({ ...prev, [fieldId]: error }));
    }
  };

  const validateFields = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    parsedFields.forEach(field => {
      const val = fieldValues[field.id] || '';
      const isReq = field.isRequired !== undefined ? field.isRequired : !field.isOptional;
      const isNumeric = field.type === 'number' || field.isNumericOnly;

      if (!val && isReq) {
        newErrors[field.id] = t('send_message.field_required');
        isValid = false;
        return;
      }
      if (val && isNumeric && !/^\d+$/.test(val)) {
        newErrors[field.id] = t('send_message.field_numeric_only');
        isValid = false;
        return;
      }
      if (val && field.regexPattern) {
        try {
          const rx = new RegExp(field.regexPattern);
          if (!rx.test(val)) {
            newErrors[field.id] = field.regexErrorMsg || t('send_message.field_invalid_format');
            isValid = false;
          }
        } catch (e) {
          console.error("Invalid regex in template:", field.regexPattern);
        }
      }
    });

    setFieldErrors(newErrors);
    return isValid;
  };

  const generateOutput = (): string => {
    if (!selectedTemplate) return '';
    let result = '';

    parsedFields.forEach((f, idx) => {
      let val = (fieldValues[f.id] || '').trim();
      const isReq = f.isRequired !== undefined ? f.isRequired : !f.isOptional;
      
      if (!val && !isReq) return; // Skip if optional and empty

      let pre = f.prefix;
      let suf = f.suffix;

      if (f.secondaryRegexTrigger) {
        try {
          const rx = new RegExp(f.secondaryRegexTrigger);
          if (rx.test(val)) {
            pre = f.secondaryPrefix;
            suf = f.secondarySuffix;
          }
        } catch (e) { }
      }

      result += `${pre || ''}${val}${suf || ''}`;
      // simple space separator between fields
      if (idx !== parsedFields.length - 1 && parsedFields[idx+1]) {
        // Only add space if next field might have content
        result += ' ';
      }
    });

    // Wrap with root-level prefix/suffix
    const finalContent = `${initialSuffix}${result.trim()}${finalPrefix}`;
    return finalContent.replace(/\s+/g, ' '); // simple collapse spaces
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    if (!validateFields()) return;

    if (!hasActiveDevices) {
      if (!window.confirm(t('send_message.no_node_confirm'))) {
        return;
      }
    }

    setServerError('');
    setLoading(true);

    const finalContent = generateOutput();

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(t('send_message.timeout_error'))), 10000);
      });

      // Race the sendMessage call against the timeout
      await Promise.race([
        sendMessage({
          channelId: channelIdBigInt,
          content: finalContent,
          templateId: selectedTemplate.templateId
        }),
        timeoutPromise
      ]);

      setShowSuccess(true);
      setTimeout(() => {
        navigate(`/venues/${venue.link}/channels/${channel.channelId}`);
      }, 2000);
    } catch (err: unknown) {
      console.error("SendMessage error:", err);
      setServerError(t(err instanceof Error ? err.message : String(err)));
      setLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
        <CheckCircle size={80} color="var(--accent-color)" style={{ marginBottom: '24px' }} />
        <h1>{t('send_message.success_title')}</h1>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="content-area">
        <div className="screen-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="icon-button"
              onClick={() => {
                if (selectedTemplateId && channelTemplates.length > 1) {
                  setSelectedTemplateId(null);
                  setFieldValues({});
                  setFieldErrors({});
                } else {
                  navigate(-1);
                }
              }}
              aria-label={t('aria.back')}
            >
              <ArrowLeft size={20} style={{ transform: 'translateY(1px)' }} />
            </button>
            <h2>{t('send_message.title')}</h2>
          </div>
        </div>

        {!selectedTemplateId ? (
          <div className="flex-col" style={{ gap: '16px', maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '8px' }}>{t('send_message.select_template')}</h3>
            <div className="list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {channelTemplates.map(template => (
                <div
                  key={template.templateId.toString()}
                  className="glass-panel"
                  style={{ padding: '16px', cursor: 'pointer' }}
                  onClick={() => setSelectedTemplateId(template.templateId)}
                >
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{template.name}</h3>
                  {template.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{template.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex-col" style={{ gap: '24px', maxWidth: '600px', margin: '0 auto', paddingBottom: '60px' }}>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '8px', color: 'var(--accent-color)' }}>{selectedTemplate?.name}</h3>
              {selectedTemplate?.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>{selectedTemplate.description}</p>
              )}

              {serverError && (
                <div style={{
                  color: 'var(--error-color)', fontSize: '0.9rem',
                  padding: '10px 14px', marginBottom: '16px',
                  background: 'rgba(255,80,80,0.1)', borderRadius: '8px',
                  border: '1px solid var(--error-color)',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, transform: 'translateY(1px)' }} /> {serverError}
                </div>
              )}

              <div className="flex-col" style={{ gap: '16px' }}>
                {parsedFields.map((field) => {
                  const isReq = field.isRequired !== undefined ? field.isRequired : !field.isOptional;
                  const isNumeric = field.type === 'number' || field.isNumericOnly;
                  
                  return (
                    <div key={field.id}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>
                        {field.name} {isReq ? <span style={{ color: 'var(--error-color)' }}>*</span> : <span style={{ color: 'var(--text-secondary)' }}>{t('send_message.optional')}</span>}
                      </label>
                      <input
                        type={isNumeric ? "number" : (field.type || "text")}
                        value={fieldValues[field.id] || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        style={{ width: '100%' }}
                        autoFocus={parsedFields[0]?.id === field.id}
                      />
                      {fieldErrors[field.id] && (
                        <p style={{ color: 'var(--error-color)', fontSize: '0.85rem', marginTop: '6px' }}>{fieldErrors[field.id]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px', marginTop: '8px' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--text-secondary)' }}>{t('send_message.live_preview')}</h3>
              <div style={{ padding: '16px', background: '#111', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '1.1rem', wordBreak: 'break-word', minHeight: '60px' }}>
                {generateOutput() || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t('send_message.preview_empty')}</span>}
              </div>
            </div>

            <div className="glass-panel" style={{ display: 'flex', gap: '12px', marginTop: '16px', position: 'sticky', bottom: '-16px', padding: '16px', zIndex: 10, margin: '0 -16px -16px -16px', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '0' }}>
              <button 
                type="submit" 
                disabled={loading} 
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                aria-label={t('aria.send')}
              >
                <Send size={18} /> {loading ? t('send_message.sending') : t('send_message.title')}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};
