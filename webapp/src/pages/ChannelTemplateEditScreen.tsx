import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTable, useReducer } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings/index.ts';
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Settings2, Code, FileText, Check, AlertTriangle, ChevronDown } from 'lucide-react';
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
  type: 'text' | 'number' | 'date';
  isRequired: boolean;
  useConditional: boolean;
}

export const ChannelTemplateEditScreen = () => {
  const { t } = useTranslation();
  const { venueLink, channelId, templateId } = useParams<{ venueLink: string, channelId: string, templateId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();

  const [venues] = useTable(tables.VenueView);
  const [channels] = useTable(tables.ChannelView);
  const [channelRoles] = useTable(tables.ChannelMemberRoleView);
  const [venueMembers] = useTable(tables.VenueMemberView);
  const [templates] = useTable(tables.MessageTemplateView);

  const createTemplate = useReducer(reducers.createMessageTemplate);
  const updateTemplate = useReducer(reducers.updateMessageTemplate);
  const deleteTemplate = useReducer(reducers.deleteMessageTemplate);

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = channelId ? BigInt(channelId) : 0n;
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt);

  // Re-check owner permissions
  const myVenueRole = venueMembers.find(
    (m: any) => m.userId === user?.userId && m.venueId === venue?.venueId
  )?.role.tag;
  const myChannelRole = channelRoles.find(
    (r: any) => r.userId === user?.userId && r.channelId === channel?.channelId
  )?.role.tag;

  const isVenueOwner = myVenueRole?.toLowerCase() === 'owner';
  const isChannelOwner = myChannelRole?.toLowerCase() === 'owner';
  const isChannelAdmin = myChannelRole?.toLowerCase() === 'admin';

  const canManageTemplates = isVenueOwner || isChannelOwner || isChannelAdmin;

  const isNew = templateId === 'new';
  const templateIdBigInt = !isNew && templateId ? BigInt(templateId) : undefined;
  const existingTemplate = templateIdBigInt ? templates.find(t => t.templateId === templateIdBigInt) : null;

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialSuffix, setInitialSuffix] = useState('');
  const [finalPrefix, setFinalPrefix] = useState('');
  const [fields, setFields] = useState<TemplateField[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [animatingIndices, setAnimatingIndices] = useState<{ [key: number]: number } | null>(null);
  const fieldRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [invalidFieldIds, setInvalidFieldIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newFieldIds, setNewFieldIds] = useState<string[]>([]);
  const [activeMovingIndex, setActiveMovingIndex] = useState<number | null>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      if (venueLink) {
        navigate(`/login?redirect=/venues/${venueLink}/channels/${channelId}/templates/${templateId}`, { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
      return;
    }

    if (!loaded) {
      if (existingTemplate) {
        setName(existingTemplate.name);
        setDescription(existingTemplate.description);
        try {
          const parsed = JSON.parse(existingTemplate.fieldsJson);
          let rawFields = [];

          if (Array.isArray(parsed)) {
            rawFields = parsed;
          } else if (parsed && typeof parsed === 'object') {
            rawFields = parsed.fields || [];
            setInitialSuffix(parsed.initialSuffix || '');
            setFinalPrefix(parsed.finalPrefix || '');
          }

          // Migration/Normalization
          const migratedFields = rawFields.map((f: any) => ({
            ...f,
            type: f.type || (f.isNumericOnly ? 'number' : 'text'),
            isRequired: f.isRequired !== undefined ? f.isRequired : !f.isOptional,
            useConditional: f.useConditional !== undefined ? f.useConditional : !!f.secondaryRegexTrigger,
          }));
          setFields(migratedFields);
        } catch (e) {
          setFields([]);
        }
        setLoaded(true);
      } else if (isNew) {
        // Only if it's new and we haven't added the default field
        if (fields.length === 0) {
          handleAddField();
        }
        setLoaded(true);
      }
    }
  }, [isLoggedIn, navigate, venueLink, channelId, templateId, existingTemplate, isNew, loaded, fields.length]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!canManageTemplates) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('template_edit.only_owners_edit')}</p>
        <button onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  const handleAddField = () => {
    const newId = Math.random().toString(36).substring(7);
    setNewFieldIds(prev => [...prev, newId]);
    setTimeout(() => {
      setNewFieldIds(prev => prev.filter(id => id !== newId));
    }, 1000);

    setFields([...fields, {
      id: newId,
      name: `${t('template_edit.field.default_name')} ${fields.length + 1}`,
      prefix: '',
      suffix: '',
      regexPattern: '',
      regexErrorMsg: '',
      secondaryPrefix: '',
      secondarySuffix: '',
      secondaryRegexTrigger: '',
      type: 'text',
      isRequired: false,
      useConditional: false,
    }]);
  };

  const handleRemoveField = (indexToRemove: number) => {
    if (window.confirm(t('template_edit.field.confirm_delete', 'Are you sure you want to remove this field?'))) {
      setFields(fields.filter((_, idx) => idx !== indexToRemove));
    }
  };

  const handleChangeField = (index: number, key: keyof TemplateField, value: string | boolean) => {
    const newFields = [...fields];
    const updatedField = { ...newFields[index], [key]: value };

    // Clear regex logic if the field is made optional to prevent hidden validation
    if (key === 'isRequired' && value === false) {
      updatedField.regexPattern = '';
      updatedField.regexErrorMsg = '';
    }

    // Clear conditional formatting if disabled
    if (key === 'useConditional' && value === false) {
      updatedField.secondaryRegexTrigger = '';
      updatedField.secondaryPrefix = '';
      updatedField.secondarySuffix = '';
    }

    // Clear invalid state for this field if it was marked
    if (invalidFieldIds.includes(updatedField.id)) {
      setInvalidFieldIds(prev => prev.filter(id => id !== updatedField.id));
    }

    newFields[index] = updatedField;
    setFields(newFields);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0 || isMoving) return;
    setIsMoving(true);
    setActiveMovingIndex(index);
    setNewFieldIds([]); // Cancel any pending mount animations

    const card1 = fieldRefs.current[index];
    const card2 = fieldRefs.current[index - 1];

    if (card1 && card2 && contentAreaRef.current) {
      // Manual scroll to move slowly and accurately
      const h1 = card1.offsetHeight;
      const h2 = card2.offsetHeight;
      const rect = card1.getBoundingClientRect();
      const containerRect = contentAreaRef.current.getBoundingClientRect();
      const currentScroll = contentAreaRef.current.scrollTop;
      const targetScroll = currentScroll + (rect.top - containerRect.top) - h2 - 32;

      const gap = 16;
      setAnimatingIndices({
        [index]: -(h2 + gap),
        [index - 1]: (h1 + gap)
      });

      // Start scroll with a tiny delay to sync with CSS animation better
      setTimeout(() => {
        if (contentAreaRef.current) {
          contentAreaRef.current.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth'
          });
        }
      }, 50);

      setTimeout(() => {
        // Atomic update to prevent flicker
        const newFields = [...fields];
        [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];

        // Clearing indices, setting fields, and disabling transitions in the same batch
        setFields(newFields);
        setAnimatingIndices(null);
        setIsMoving(false);
        setActiveMovingIndex(null);
      }, 1500); // Slightly more time to allow scroll to settle
    } else {
      const newFields = [...fields];
      [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
      setFields(newFields);
      setTimeout(() => setIsMoving(false), 800);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index === fields.length - 1 || isMoving) return;
    setIsMoving(true);
    setActiveMovingIndex(index);
    setNewFieldIds([]); // Cancel any pending mount animations

    const card1 = fieldRefs.current[index];
    const card2 = fieldRefs.current[index + 1];

    if (card1 && card2 && contentAreaRef.current) {
      const h1 = card1.offsetHeight;
      const h2 = card2.offsetHeight;
      const rect = card1.getBoundingClientRect();
      const containerRect = contentAreaRef.current.getBoundingClientRect();
      const currentScroll = contentAreaRef.current.scrollTop;
      const targetScroll = currentScroll + (rect.top - containerRect.top) + h2;

      contentAreaRef.current.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });

      const gap = 16;

      setAnimatingIndices({
        [index]: (h2 + gap),
        [index + 1]: -(h1 + gap)
      });

      setTimeout(() => {
        // Atomic update to prevent flicker
        const newFields = [...fields];
        [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];

        // Clearing indices, setting fields, and disabling transitions in the same batch
        setFields(newFields);
        setAnimatingIndices(null);
        setIsMoving(false);
        setActiveMovingIndex(null);
      }, 1500);
    } else {
      const newFields = [...fields];
      [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
      setFields(newFields);
      setTimeout(() => setIsMoving(false), 800);
    }
  };

  const generatePreview = () => {
    if (fields.length === 0) return t('template_edit.no_fields_preview');

    let result = '';
    fields.forEach((f, idx) => {
      let textVal = f.type === 'number' ? "123" :
        f.type === 'date' ? new Date().toLocaleDateString(t('languages.' + (localStorage.getItem('language') || 'en'))) :
          t('template_edit.sample_field', { name: f.name || `Field ${idx + 1}` });

      result += `${f.prefix || ''}${textVal}${f.suffix || ''}`;
      if (idx !== fields.length - 1) result += ' '; // minor spacing heuristic
    });

    return `${initialSuffix}${result}${finalPrefix}`.trim();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Quick validation filter
    if (fields.length === 0) {
      setErrorText(t('template_edit.no_fields_error'));
      return;
    }

    setLoading(true);
    setErrorText('');
    setInvalidFieldIds([]);

    // If field is required, a validation regex must be provided
    const missingRegexFields = fields.filter(f => f.isRequired && !f.regexPattern?.trim());
    if (missingRegexFields.length > 0) {
      const fieldNames = missingRegexFields.map(f => f.name || f.id).join(', ');
      setErrorText(t('template_edit.mandatory_regex_error', { name: fieldNames }));
      setInvalidFieldIds(missingRegexFields.map(f => f.id));
      setShowErrorModal(true);
      setLoading(false);
      return;
    }

    try {
      const payloadString = JSON.stringify({
        initialSuffix,
        finalPrefix,
        fields
      });

      if (isNew) {
        await createTemplate({
          channelId: channelIdBigInt,
          name: name.trim(),
          description: description.trim(),
          fieldsJson: payloadString
        });
      } else if (existingTemplate) {
        await updateTemplate({
          templateId: existingTemplate.templateId,
          name: name.trim(),
          description: description.trim(),
          fieldsJson: payloadString
        });
      }

      navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`);
    } catch (err: unknown) {
      setErrorText(t(err instanceof Error ? err.message : String(err)));
      setShowErrorModal(true);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!existingTemplate) return;
    setLoading(true);
    try {
      await deleteTemplate({ templateId: existingTemplate.templateId });
      navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`);
    } catch (err: unknown) {
      setErrorText(t(err instanceof Error ? err.message : String(err)));
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const ErrorModal = () => (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={() => setShowErrorModal(false)}>
      <div className="glass-panel" style={{ padding: '32px', maxWidth: '400px', width: '90%', border: '1px solid var(--error-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex-col" style={{ alignItems: 'center', textAlign: 'center', gap: '16px' }}>
          <AlertTriangle size={48} color="var(--error-color)" />
          <h2 style={{ margin: 0 }}>{t('common.error')}</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{errorText}</p>
          <button
            className="primary"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => setShowErrorModal(false)}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {showErrorModal && <ErrorModal />}
      <div className="content-area" ref={contentAreaRef}>
        <div className="screen-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="icon-button"
              onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`)}
            >
              <ArrowLeft size={20} />
            </button>
            <h2>{isNew ? t('template_edit.title_new') : t('template_edit.title_edit')}</h2>
          </div>
          {!isNew && (
            <button
              className="icon-button danger"
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              title={t('template_edit.danger_zone.delete_button')}
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
        <form onSubmit={handleSave} className="flex-col" style={{ gap: '24px', maxWidth: '800px', margin: '0 auto', paddingBottom: '60px' }}>




          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--accent-color)' }}>{t('template_edit.config_title')}</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('template_edit.name_label')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('template_edit.desc_label')}</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('template_edit.initial_suffix_label')}</label>
            <input
              type="text"
              value={initialSuffix}
              onChange={(e) => setInitialSuffix(e.target.value)}
              disabled={loading}
              style={{ width: '100%' }}
            />
          </div>


          <div className="flex-col" style={{ gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ color: 'var(--accent-color)', margin: 0 }}>{t('template_edit.fields_title')}</h3>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              {t('template_edit.fields_helper', 'Setup the input fields for the user to type when sending a message using this template.')}
            </p>

            <div className="fields-list-container flex-col" style={{ gap: '16px' }}>
              {fields.map((field, idx) => {
                const offset = animatingIndices?.[idx] || 0;
                return (
                  <div
                    key={field.id}
                    ref={el => { fieldRefs.current[idx] = el; }}
                    className={`field-card-wrapper ${offset < 0 ? 'moving-up' : offset > 0 ? 'moving-down' : ''} ${isMoving && offset === 0 ? 'blur-sibling' : ''}`}
                    style={{
                      transform: offset ? `translateY(${offset}px) scale(1)` : 'none',
                      zIndex: idx === activeMovingIndex ? 60 : (offset !== 0 || isMoving) ? 40 : 1,
                      transition: !isMoving ? 'none' : undefined,
                    }}
                  >
                    <div
                      className={`glass-panel ${!isMoving && newFieldIds.includes(field.id) ? 'field-zoom' : ''}`}
                      style={{
                        padding: '24px',
                        borderLeft: '4px solid var(--accent-color)',
                        border: invalidFieldIds.includes(field.id) ? '2px solid var(--error-color)' : undefined
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '1.1rem' }}>{field.name || `Field ${(idx + 1)}`}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            title={t('common.move_up')}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === fields.length - 1}
                            title={t('common.move_down')}
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => handleRemoveField(idx)}
                            title={t('template_edit.remove_field')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.name_label')}</label>
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) => handleChangeField(idx, 'name', e.target.value)}
                            required
                            style={{ width: '100%' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '150px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.prefix_label')}</label>
                            <input
                              type="text"
                              value={field.prefix}
                              onChange={(e) => handleChangeField(idx, 'prefix', e.target.value)}
                              style={{ width: '100%' }}
                            />
                          </div>

                          <div style={{ flex: 1, minWidth: '150px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.suffix_label')}</label>
                            <input
                              type="text"
                              value={field.suffix}
                              onChange={(e) => handleChangeField(idx, 'suffix', e.target.value)}
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Code size={16} /> {t('template_edit.field.validation_title')}
                            </h4>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '0' }}>
                            <div style={{ position: 'relative' }}>
                              <select
                                value={field.type}
                                onChange={(e) => handleChangeField(idx, 'type', e.target.value as any)}
                                style={{
                                  width: '100%',
                                  appearance: 'none',
                                  padding: '10px 14px',
                                  paddingRight: '36px',
                                  background: 'rgba(0, 0, 0, 0.3)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--surface-border)',
                                  color: 'var(--text-primary)',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem'
                                }}
                              >
                                <option value="text">{t('template_edit.field.type.text')}</option>
                                <option value="number">{t('template_edit.field.type.number')}</option>
                                <option value="date">{t('template_edit.field.type.date')}</option>
                              </select>
                              <ChevronDown
                                size={16}
                                style={{
                                  position: 'absolute',
                                  right: '10px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  pointerEvents: 'none',
                                  color: 'var(--text-secondary)'
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                <div className="switch" style={{ flexShrink: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={field.isRequired}
                                    onChange={(e) => handleChangeField(idx, 'isRequired', e.target.checked)}
                                  />
                                  <span className="slider"></span>
                                </div>
                                <span style={{ fontSize: '0.9rem' }}>{t('template_edit.field.required_label')}</span>
                              </label>
                            </div>
                          </div>

                          <div className={`reveal-section ${field.isRequired ? 'show' : ''}`} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.regex_pattern')}</label>
                              <input
                                type="text"
                                value={field.regexPattern || ''}
                                onChange={(e) => handleChangeField(idx, 'regexPattern', e.target.value)}
                                style={{ width: '100%', fontFamily: 'monospace' }}
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.regex_error')}</label>
                              <input
                                type="text"
                                value={field.regexErrorMsg || ''}
                                onChange={(e) => handleChangeField(idx, 'regexErrorMsg', e.target.value)}
                                style={{ width: '100%' }}
                              />
                            </div>
                          </div>
                        </div>


                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0' }}>
                            <h4 style={{ margin: 0, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "8px" }}>
                              <Settings2 size={16} /> {t("template_edit.field.secondary_title")}
                            </h4>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.enable_conditional')}</span>
                              <div className="switch">
                                <input
                                  type="checkbox"
                                  checked={field.useConditional}
                                  onChange={(e) => handleChangeField(idx, "useConditional", e.target.checked)}
                                />
                                <span className="slider"></span>
                              </div>
                            </label>
                          </div>

                          <div className={`reveal-section ${field.useConditional ? 'show' : ''}`} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                              {t("template_edit.field.secondary_helper")}
                            </p>
                            <div style={{ marginTop: '8px' }}>
                              <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{t("template_edit.field.secondary_regex")}</label>
                              <input
                                type="text"
                                value={field.secondaryRegexTrigger || ""}
                                onChange={(e) => handleChangeField(idx, "secondaryRegexTrigger", e.target.value)}
                                style={{ width: "100%", fontFamily: "monospace" }}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.secondary_prefix')}</label>
                                <input
                                  type="text"
                                  value={field.secondaryPrefix || ""}
                                  onChange={(e) => handleChangeField(idx, "secondaryPrefix", e.target.value)}
                                  style={{ width: "100%" }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.secondary_suffix')}</label>
                                <input
                                  type="text"
                                  value={field.secondarySuffix || ""}
                                  onChange={(e) => handleChangeField(idx, "secondarySuffix", e.target.value)}
                                  style={{ width: "100%" }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                className="secondary"
                style={{ padding: '16px', border: 'dashed 2px rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={handleAddField}
              >
                <Plus size={18} /> {t('template_edit.add_field')}
              </button>

            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('template_edit.final_prefix_label')}</label>
              <input
                type="text"
                value={finalPrefix}
                onChange={(e) => setFinalPrefix(e.target.value)}
                disabled={loading}
                style={{ width: '100%' }}
              />
            </div>
          </div>


          <div className="glass-panel" style={{ padding: '24px', marginTop: '8px' }}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--accent-color)" /> {t('template_edit.preview_title')}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>
              {t('template_edit.preview_helper', 'This is how your sent messages using this template will generally appear:')}
            </p>
            <div style={{ padding: '16px', background: '#111', borderRadius: '8px', border: '1px solid var(--surface-border)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
              {generatePreview()}
            </div>
          </div>

          <div className="glass-panel" style={{ display: 'flex', gap: '12px', marginTop: '16px', position: 'sticky', bottom: '-16px', padding: '16px', zIndex: 9999, margin: '0 -10px -16px -10px', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '0', flexDirection: 'column' }}>
            <div className="flex-row" style={{ gap: '12px', width: '100%' }}>
              <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => navigate(-1)} disabled={loading}>
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={loading || !name.trim()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} >
                <Check size={18} /> {loading ? t('template_edit.saving') : t('template_edit.save_template')}
              </button>
            </div>
            {errorText && (
              <div style={{
                color: 'var(--error-color)',
                fontSize: '0.9rem',
                padding: '10px 14px',
                background: 'rgba(255,80,80,0.1)',
                borderRadius: '8px',
                border: '1px solid var(--error-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '12px'
              }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} /> {errorText}
              </div>
            )}
          </div>

        </form>
      </div>

      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="glass-panel flex-col" style={{ padding: '24px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--error-color)' }}>{t('template_edit.danger_zone.confirm_title')}</h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {t('template_edit.danger_zone.confirm_text')}
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading}
              >
                {t('common.cancel')}
              </button>
              <button
                className="danger"
                style={{ flex: 1 }}
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
