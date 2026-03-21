import { useLocation, Link } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Home } from 'lucide-react';

export const Breadcrumbs = () => {
  const { t } = useTranslation();
  const location = useLocation();
  
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [users] = useTable(tables.User);
  const [templates] = useTable(tables.MessageTemplate);

  // Don't show on login or home (redirects anyway)
  if (location.pathname === '/login' || location.pathname === '/') {
    return null;
  }

  const pathnames = location.pathname.split('/').filter((x) => x);

  const getBreadcrumbs = () => {
    const crumbs: { label: string; path: string }[] = [];
    let currentPath = '';

    // Always start with Venues if we're in the venues subpath
    if (pathnames[0] === 'venues') {
      currentPath = '/venues';
    } else if (pathnames[0] === 'profile') {
      crumbs.push({ label: t('nav.profile'), path: '/profile' });
      return crumbs;
    } else if (pathnames[0] === 'join') {
      crumbs.push({ label: t('breadcrumb.join'), path: location.pathname });
      return crumbs;
    }

    // Attempt to identify the current venue context if available in path
    const venueLink = pathnames[1] !== 'new' ? pathnames[1] : undefined;
    const currentVenue = venueLink ? venues.find(v => v.link === venueLink) : undefined;

    for (let i = 1; i < pathnames.length; i++) {
        const segment = pathnames[i];
        currentPath += `/${segment}`;

        if (pathnames[i-1] === 'venues') {
            if (segment === 'new') {
                crumbs.push({ label: t('breadcrumb.new_venue'), path: currentPath });
            } else {
                crumbs.push({ label: currentVenue?.name || segment, path: `/venues/${segment}` });
            }
        } else if (segment === 'settings' && pathnames[i-1] !== 'channels') {
            crumbs.push({ label: t('breadcrumb.settings'), path: currentPath });
        } else if (segment === 'permissions') {
            crumbs.push({ label: t('breadcrumb.permissions'), path: currentPath });
        } else if (pathnames[i-1] === 'permissions' && segment !== 'new') {
            const memberId = BigInt(segment);
            const user = users.find(u => u.userId === memberId);
            crumbs.push({ label: user?.name || segment, path: currentPath });
        } else if (segment === 'channels') {
            // "channels" is just a structural segment in the URL
            continue; 
        } else if (pathnames[i-1] === 'channels') {
            if (segment === 'new') {
                crumbs.push({ label: t('breadcrumb.new_channel'), path: currentPath });
            } else {
                try {
                    const cid = BigInt(segment);
                    const channel = channels.find(c => c.channelId === cid);
                    crumbs.push({ label: channel?.name || segment, path: currentPath });
                } catch {
                    crumbs.push({ label: segment, path: currentPath });
                }
            }
        } else if (segment === 'send') {
            crumbs.push({ label: t('breadcrumb.send_message'), path: currentPath });
        } else if (segment === 'templates') {
            crumbs.push({ label: t('breadcrumb.templates'), path: currentPath });
        } else if (pathnames[i-1] === 'templates') {
            try {
                const tid = BigInt(segment);
                const template = templates.find(temp => temp.templateId === tid);
                crumbs.push({ label: template?.name || segment, path: currentPath });
            } catch {
                crumbs.push({ label: segment, path: currentPath });
            }
        } else if (segment === 'settings' && pathnames[i-1] === 'channels') {
            crumbs.push({ label: t('breadcrumb.settings'), path: currentPath });
        } else if (segment === 'desktop-displays') {
            crumbs.push({ label: t('breadcrumb.displays'), path: currentPath });
        } else if (pathnames[i-1] === 'desktop-displays' && segment === 'new') {
             crumbs.push({ label: t('breadcrumb.new_node'), path: currentPath });
        }
    }

    return crumbs;
  };

  const crumbs = getBreadcrumbs();

  if (crumbs.length <= 0) return null;

  return (
    <div className="breadcrumbs-container">
      <div className="breadcrumbs-content">
        <Link to="/venues" className="breadcrumb-item home">
          <Home size={14} />
        </Link>
        {crumbs.map((crumb, index) => (
          <div key={crumb.path + index} className="breadcrumb-wrapper">
            <ChevronRight size={14} className="breadcrumb-separator" />
            {index === crumbs.length - 1 ? (
              <span className="breadcrumb-item active">{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className="breadcrumb-item">
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
