import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';

export const ChannelTemplatesScreen = () => {
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();

  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers] = useTable(tables.VenueMember);
  const [templates] = useTable(tables.MessageTemplate);

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

  const channelTemplates = templates.filter(t => t.channelId === channelIdBigInt);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate('/login', { replace: true });
      return;
    }
  }, [isLoggedIn, navigate]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!isChannelOwner) {
    return (
      <div className="app-container empty-state">
        <h2>Access Denied</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>Only channel owners can manage templates.</p>
        <button onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)} style={{ marginTop: '16px' }}>Go back</button>
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
          <h2>{channel.name} Templates</h2>
        </div>
        <button 
          className="icon-button"
          onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates/new`)}
          title="New Template"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="content-area" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {channelTemplates.length === 0 ? (
          <div className="empty-state">
            <h3 style={{ marginBottom: '8px' }}>No Templates</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Create a template to start sending structured messages to this channel.
            </p>
            <button 
              onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates/new`)}
            >
              <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              Create Template
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
