import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTable, useReducer } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings/index.ts';
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Settings2, Code, FileText, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TemplateField {
  id: string; // Internal id for reordering
  name: string;
  prefix: string;
  suffix: string;
  regexPattern?: string;
  regexErrorMsg?: string;
  secondaryPrefix: string;
  secondarySuffix: string;
  secondaryRegexTrigger?: string;
  isNumericOnly: boolean;
  isOptional: boolean;
}

export const ChannelTemplateEditScreen = () => {
  const { t } = useTranslation();
  const { venueLink, channelId, templateId } = useParams<{ venueLink: string, channelId: string, templateId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();

  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers] = useTable(tables.VenueMember);
  const [templates] = useTable(tables.MessageTemplate);

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

  const isVenueOwner = venue?.ownerId === user?.userId || myVenueRole?.toLowerCase() === 'owner';
  const isChannelOwner = isVenueOwner || myChannelRole?.toLowerCase() === 'owner';

  const isNew = templateId === 'new';
  const templateIdBigInt = !isNew && templateId ? BigInt(templateId) : undefined;
  const existingTemplate = templateIdBigInt ? templates.find(t => t.templateId === templateIdBigInt) : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<TemplateField[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      if (venueLink) {
        navigate(`/login?redirect=/venues/${venueLink}/channels/${channelId}/templates/${templateId}`, { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
      return;
    }

    if (existingTemplate && name === '') {
      setName(existingTemplate.name);
      setDescription(existingTemplate.description);
      try {
        const parsedFields = JSON.parse(existingTemplate.fieldsJson);
        setFields(parsedFields);
      } catch (e) {
        setFields([]);
      }
    } else if (isNew && fields.length === 0) {
      // Add a simple default field for purely structural convenience
      handleAddField();
    }
  }, [isLoggedIn, navigate, venueLink, channelId, templateId, existingTemplate, name, isNew]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!isChannelOwner) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('template_edit.only_owners_edit')}</p>
        <button onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  const handleAddField = () => {
    setFields([...fields, {
      id: Math.random().toString(36).substring(7),
      name: `Field ${fields.length + 1}`,
      prefix: '',
      suffix: '',
      regexPattern: '',
      regexErrorMsg: '',
      secondaryPrefix: '',
      secondarySuffix: '',
      secondaryRegexTrigger: '',
      isNumericOnly: false,
      isOptional: false,
    }]);
  };

  const handleRemoveField = (indexToRemove: number) => {
    setFields(fields.filter((_, idx) => idx !== indexToRemove));
  };

  const handleChangeField = (index: number, key: keyof TemplateField, value: string | boolean) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [key]: value };
    setFields(newFields);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newFields = [...fields];
    [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
    setFields(newFields);
  };

  const handleMoveDown = (index: number) => {
    if (index === fields.length - 1) return;
    const newFields = [...fields];
    [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
    setFields(newFields);
  };

  const generatePreview = () => {
    if (fields.length === 0) return t('template_edit.no_fields_preview');
    
    let result = '';
    fields.forEach((f, idx) => {
      let textVal = f.isNumericOnly ? "123" : `[Sample ${f.name}]`;
      // If optional, and empty? Typically we skip, but for preview we show it exists
      result += `${f.prefix || ''}${textVal}${f.suffix || ''}`;
      if (idx !== fields.length - 1) result += ' '; // minor spacing heuristic
    });
    return result.trim();
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

    try {
      const payloadString = JSON.stringify(fields);

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

  return (
    <div className="app-container">
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="icon-button" 
            onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`)}
          >
            <ArrowLeft size={20} style={{ transform: 'translateY(1px)' }} />
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

      <div className="content-area" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        <form onSubmit={handleSave} className="flex-col" style={{ gap: '24px', maxWidth: '600px', margin: '0 auto', paddingBottom: '60px' }}>
          
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
              gap: '8px'
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} /> {errorText}
            </div>
          )}

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--accent-color)' }}>{t('template_edit.fields_title')}</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('template_edit.name_label')}</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                placeholder={t('template_edit.name_placeholder')}
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
                placeholder={t('template_edit.desc_placeholder')}
                style={{ width: '100%' }}
              />
            </div>
          </div>


          <div className="flex-col" style={{ gap: '16px' }}>
             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <h3 style={{ color: 'var(--accent-color)', margin: 0 }}>{t('template_edit.fields_title')}</h3>
             </div>
             
             <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
               {t('template_edit.fields_helper', 'Setup the input fields for the user to type when sending a message using this template.')}
             </p>

             <div className="flex-col" style={{ gap: '16px' }}>
               {fields.map((field, idx) => (
                 <div 
                   key={field.id}
                   className="glass-panel" 
                   style={{ padding: '16px', borderLeft: '4px solid var(--accent-color)' }}
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
                         title="Move Up"
                       >
                         <ArrowUp size={16} />
                       </button>
                       <button 
                         type="button"
                         className="icon-button"
                         onClick={() => handleMoveDown(idx)}
                         disabled={idx === fields.length - 1}
                         title="Move Down"
                       >
                         <ArrowDown size={16} />
                       </button>
                       <button 
                         type="button"
                         className="icon-button danger"
                         onClick={() => handleRemoveField(idx)}
                         title="Remove Field"
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
                           placeholder="e.g. Total: $"
                           style={{ width: '100%' }}
                         />
                       </div>
                       
                       <div style={{ flex: 1, minWidth: '150px' }}>
                         <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.suffix_label')}</label>
                         <input 
                           type="text" 
                           value={field.suffix}
                           onChange={(e) => handleChangeField(idx, 'suffix', e.target.value)}
                           placeholder="e.g. .00"
                           style={{ width: '100%' }}
                         />
                       </div>
                     </div>

                     <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                       <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <Code size={16} /> {t('template_edit.field.validation_title')}
                       </h4>
                       <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={field.isNumericOnly}
                              onChange={(e) => handleChangeField(idx, 'isNumericOnly', e.target.checked)}
                            />
                            <span style={{ fontSize: '0.9rem' }}>{t('template_edit.field.is_numeric')}</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={field.isOptional}
                              onChange={(e) => handleChangeField(idx, 'isOptional', e.target.checked)}
                            />
                            <span style={{ fontSize: '0.9rem' }}>{t('template_edit.field.is_optional')}</span>
                          </label>
                       </div>
                       
                       <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                         <div style={{ flex: 1, minWidth: '150px' }}>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.regex_pattern')}</label>
                           <input 
                             type="text" 
                             value={field.regexPattern || ''}
                             onChange={(e) => handleChangeField(idx, 'regexPattern', e.target.value)}
                             placeholder="e.g. ^[A-Z]{3}$"
                             style={{ width: '100%', fontFamily: 'monospace' }}
                           />
                         </div>
                         <div style={{ flex: 1, minWidth: '150px' }}>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.regex_error')}</label>
                           <input 
                             type="text" 
                             value={field.regexErrorMsg || ''}
                             onChange={(e) => handleChangeField(idx, 'regexErrorMsg', e.target.value)}
                             placeholder="e.g. Must be 3 capital letters"
                             style={{ width: '100%' }}
                           />
                         </div>
                       </div>
                     </div>
                     

                     <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                       <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <Settings2 size={16} /> {t('template_edit.field.secondary_title')} 
                       </h4>
                       <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
                         {t('template_edit.field.secondary_helper')}
                       </p>
                       <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                         <div style={{ flex: 1, minWidth: '100px' }}>
                           <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.secondary_regex')}</label>
                           <input 
                             type="text" 
                             value={field.secondaryRegexTrigger || ''}
                             onChange={(e) => handleChangeField(idx, 'secondaryRegexTrigger', e.target.value)}
                             placeholder="e.g. ^[0-9]+$"
                             style={{ width: '100%', fontFamily: 'monospace' }}
                           />
                         </div>
                         <div style={{ flex: '1.5', display: 'flex', gap: '8px' }}>
                           <div style={{ flex: 1 }}>
                             <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.secondary_prefix')}</label>
                             <input 
                               type="text" 
                               value={field.secondaryPrefix || ''}
                               onChange={(e) => handleChangeField(idx, 'secondaryPrefix', e.target.value)}
                               style={{ width: '100%' }}
                             />
                           </div>
                           <div style={{ flex: 1 }}>
                             <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('template_edit.field.secondary_suffix')}</label>
                             <input 
                               type="text" 
                               value={field.secondarySuffix || ''}
                               onChange={(e) => handleChangeField(idx, 'secondarySuffix', e.target.value)}
                               style={{ width: '100%' }}
                             />
                           </div>
                         </div>
                       </div>
                     </div>

                   </div>
                 </div>
               ))}
               
               <button 
                 type="button" 
                 className="secondary" 
                 style={{ padding: '16px', border: 'dashed 2px rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                 onClick={handleAddField}
               >
                 <Plus size={18} /> {t('template_edit.add_field')}
               </button>

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

          <div className="glass-panel" style={{ display: 'flex', gap: '12px', marginTop: '16px', position: 'sticky', bottom: '-16px', padding: '16px', zIndex: 10, margin: '0 -16px -16px -16px', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '0' }}>
            <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => navigate(-1)} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={loading || !name.trim()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} >
              <Check size={18} /> {loading ? t('template_edit.saving') : t('template_edit.save_template')}
            </button>
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
