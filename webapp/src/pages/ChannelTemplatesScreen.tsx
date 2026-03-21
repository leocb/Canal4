import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { useTranslation } from 'react-i18next';

export const ChannelTemplatesScreen = () => {
  const { t } = useTranslation();
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();

  const [venues] = useTable(tables.VenueView);
  const [channels] = useTable(tables.ChannelView);
  const [channelRoles] = useTable(tables.ChannelMemberRoleView);
  const [venueMembers] = useTable(tables.VenueMemberView);
  const [templates] = useTable(tables.MessageTemplateView);

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

  const channelTemplates = templates.filter(t => t.channelId === channelIdBigInt);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login', { replace: true });
      return;
    }
  }, [isLoggedIn, navigate]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!canManageTemplates) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('channel_templates.only_owners')}</p>
        <button onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="icon-button" 
            onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)}
          >
            <ArrowLeft size={20} />
          </button>
          <h2>{t('channel_templates.title', { name: channel.name })}</h2>
        </div>
        <button 
          className="icon-button"
          onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates/new`)}
          title={t('channel_templates.new_template_tooltip')}
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="content-area" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {channelTemplates.length === 0 ? (
          <div className="empty-state">
            <h3 style={{ marginBottom: '8px' }}>{t('channel_templates.no_templates')}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('channel_templates.empty_helper')}
            </p>
            <button 
              onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates/new`)}
            >
              <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              {t('channel_templates.create_button')}
            </button>
          </div>
        ) : (
          <div className="list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {channelTemplates.map(template => (
              <div 
                key={template.templateId.toString()} 
                className="glass-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates/${template.templateId}`)}
              >
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{template.name}</h3>
                  {template.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{template.description}</p>
                  )}
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  <ChevronRight size={20} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
