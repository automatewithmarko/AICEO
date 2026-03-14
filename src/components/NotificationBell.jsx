import { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Lightbulb, Zap, Target, TrendingUp, Link2 } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/api';
import './NotificationBell.css';

const TYPE_ICONS = {
  insight: Lightbulb,
  action_needed: Zap,
  missing_integration: Link2,
  milestone: TrendingUp,
  suggestion: Target,
  warning: AlertTriangle,
};

const TYPE_COLORS = {
  insight: '#a78bfa',
  action_needed: '#f59e0b',
  missing_integration: '#ef4444',
  milestone: '#10b981',
  suggestion: '#3b82f6',
  warning: '#ef4444',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Fetch notifications on mount and poll every 30s
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { notifications: notifs } = await getNotifications();
        if (active) setNotifications(notifs || []);
      } catch {}
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await markNotificationRead(id);
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await markAllNotificationsRead();
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className="notif-bell-btn" onClick={() => setOpen(!open)}>
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={handleMarkAllRead}>
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet. Your AI CEO will flag important things here.</div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICONS[n.type] || Lightbulb;
                const color = TYPE_COLORS[n.type] || '#a78bfa';
                return (
                  <div
                    key={n.id}
                    className={`notif-item ${!n.is_read ? 'notif-item--unread' : ''}`}
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                  >
                    <div className="notif-item-icon" style={{ color, background: color + '18' }}>
                      <Icon size={16} />
                    </div>
                    <div className="notif-item-body">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-msg">{n.message}</div>
                      <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                    </div>
                    {!n.is_read && <div className="notif-item-dot" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
