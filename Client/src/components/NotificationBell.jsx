import React, { useState, useRef, useEffect } from 'react';

const NOTIF_ICONS = {
  friend_request: '👋',
  friend_accepted: '🤝',
  dm: '💬',
  kicked: '🚫',
  mention: '📢',
};

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function NotificationBell({ notifications, unreadCount, onMarkAllRead, onMarkRead }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-cafe-800/60 border border-cafe-600/30 text-white/90 hover:bg-cafe-700/60 transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full border-2 border-cafe-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-warm-lg border border-cafe-200/50 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-cafe-200/50">
            <h3 className="font-serif font-bold text-cafe-900 text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => { onMarkAllRead(); }}
                className="text-xs text-cafe-500 hover:text-cafe-700 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-10">
                <span className="text-3xl block mb-2">🔔</span>
                <p className="text-cafe-400 text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 30).map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => { if (!notif.read) onMarkRead(notif.id); }}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-cafe-100 last:border-0 transition-colors cursor-pointer ${
                    notif.read ? 'bg-white' : 'bg-amber-50/50 hover:bg-amber-50'
                  }`}
                >
                  <span className="text-lg shrink-0 mt-0.5">
                    {NOTIF_ICONS[notif.type] || '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${notif.read ? 'text-cafe-600' : 'text-cafe-900 font-medium'}`}>
                      {notif.title}
                    </p>
                    {notif.body && (
                      <p className="text-xs text-cafe-400 mt-0.5 truncate">{notif.body}</p>
                    )}
                    <p className="text-[10px] text-cafe-400 mt-1">{formatTime(notif.createdAt)}</p>
                  </div>
                  {!notif.read && (
                    <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0 mt-2" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
