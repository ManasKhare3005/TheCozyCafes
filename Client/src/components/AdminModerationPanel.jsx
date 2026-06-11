import React, { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate: 'Hate',
  sexual_content: 'Sexual content',
  violence: 'Violence',
  self_harm: 'Self-harm',
  impersonation: 'Impersonation',
  underage: 'Underage',
  other: 'Other',
};

function formatDate(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function userLabel(user) {
  if (!user) return 'Unknown user';
  return `${user.username}#${user.discriminator || '0000'}`;
}

function Snapshot({ snapshot }) {
  if (!snapshot) return null;
  const message = snapshot.messageId ? snapshot : null;
  const target = snapshot.target;

  return (
    <div className="rounded-xl border border-cafe-200 bg-cafe-50 p-3 text-sm text-cafe-700">
      {message && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-cafe-500">
            <span>{message.room?.name || 'Room'}</span>
            <span>{formatDate(message.createdAt)}</span>
            <span>{userLabel(message.sender)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-cafe-900">
            {message.text || '[media-only or empty message]'}
          </p>
          {message.mediaName && (
            <p className="text-xs text-cafe-500">{message.mediaType || 'media'}: {message.mediaName}</p>
          )}
        </div>
      )}
      {target && (
        <div className="space-y-1">
          <p className="font-medium text-cafe-900">{userLabel(target)}</p>
          <p className="text-xs text-cafe-500">Joined {formatDate(target.createdAt)}</p>
        </div>
      )}
    </div>
  );
}

function AdminModerationPanel({ token, onClose }) {
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [notes, setNotes] = useState({});

  const openCount = useMemo(
    () => reports.filter((report) => report.status === 'open').length,
    [reports],
  );

  const fetchReports = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/moderation/reports?status=${encodeURIComponent(status)}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load reports');
      setReports(data.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [status]);

  const runAction = async (report, action, options = {}) => {
    const note = notes[report.id] || '';
    const body = { resolutionNote: note, ...options.body };
    setBusyId(`${report.id}:${action}`);
    setError('');

    try {
      const res = await fetch(`${API_URL}/moderation/reports/${report.id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Moderation action failed');
      await fetchReports();
      setNotes((current) => ({ ...current, [report.id]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const updateStatus = async (report, nextStatus) => {
    setBusyId(`${report.id}:status`);
    setError('');

    try {
      const res = await fetch(`${API_URL}/moderation/reports/${report.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: nextStatus,
          resolutionNote: notes[report.id] || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update report');
      await fetchReports();
      setNotes((current) => ({ ...current, [report.id]: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-screen bg-cafe-50 cafe-texture text-cafe-900">
      <header className="sticky top-0 z-20 border-b border-cafe-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-cafe-400">Admin</p>
            <h1 className="font-serif text-2xl font-bold text-cafe-900">Moderation Queue</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              {openCount} open in this view
            </span>
            <button
              type="button"
              onClick={fetchReports}
              className="rounded-xl border border-cafe-200 bg-white px-3 py-2 text-sm font-medium text-cafe-700 hover:bg-cafe-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-cafe-800 px-3 py-2 text-sm font-medium text-white hover:bg-cafe-900"
            >
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                status === tab.value
                  ? 'bg-cafe-800 text-white'
                  : 'border border-cafe-200 bg-white text-cafe-700 hover:bg-cafe-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-xl border border-cafe-200 bg-white px-4 py-10 text-center text-cafe-500">
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-cafe-200 bg-white px-4 py-10 text-center text-cafe-500">
            No reports in this view.
          </div>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => {
              const note = notes[report.id] || '';
              const canDeleteMessage = Boolean(report.messageId);
              const canBan = Boolean(report.targetUserId && report.roomId);
              const canLockRoom = Boolean(report.roomId);
              const canBanIp = Boolean(report.targetIpHash || report.reporterIpHash);
              const busyPrefix = `${report.id}:`;

              return (
                <article key={report.id} className="rounded-2xl border border-cafe-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-cafe-100 px-2.5 py-1 text-xs font-medium text-cafe-700">
                          {report.targetType}
                        </span>
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                          {REASON_LABELS[report.reason] || report.reason}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                          {report.status}
                        </span>
                      </div>
                      <h2 className="font-serif text-lg font-bold text-cafe-900">
                        {report.targetUser ? userLabel(report.targetUser) : 'Reported content'}
                      </h2>
                      <p className="text-xs text-cafe-500">
                        Reported by {userLabel(report.reporter)} on {formatDate(report.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {report.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => updateStatus(report, 'reviewing')}
                          disabled={busyId.startsWith(busyPrefix)}
                          className="rounded-xl border border-cafe-200 px-3 py-2 text-sm font-medium text-cafe-700 hover:bg-cafe-50 disabled:opacity-50"
                        >
                          Review
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updateStatus(report, 'dismissed')}
                        disabled={busyId.startsWith(busyPrefix)}
                        className="rounded-xl border border-cafe-200 px-3 py-2 text-sm font-medium text-cafe-700 hover:bg-cafe-50 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStatus(report, 'resolved')}
                        disabled={busyId.startsWith(busyPrefix)}
                        className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>

                  {report.details && (
                    <p className="mt-3 rounded-xl border border-cafe-100 bg-cafe-50 px-3 py-2 text-sm text-cafe-700">
                      {report.details}
                    </p>
                  )}

                  <div className="mt-3">
                    <Snapshot snapshot={report.snapshot} />
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-cafe-400">
                        Resolution note
                      </span>
                      <input
                        type="text"
                        value={note}
                        onChange={(event) => setNotes((current) => ({
                          ...current,
                          [report.id]: event.target.value,
                        }))}
                        maxLength={1000}
                        className="w-full rounded-xl border border-cafe-200 bg-cafe-50 px-3 py-2 text-sm text-cafe-900 outline-none focus:border-cafe-400 focus:ring-2 focus:ring-cafe-100"
                        placeholder="Action reason or review note"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {canDeleteMessage && (
                        <button
                          type="button"
                          onClick={() => runAction(report, 'delete-message')}
                          disabled={busyId.startsWith(busyPrefix)}
                          className="rounded-xl bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          Delete message
                        </button>
                      )}
                      {canBan && (
                        <button
                          type="button"
                          onClick={() => runAction(report, 'ban-user', {
                            body: { reason: note || report.reason },
                          })}
                          disabled={busyId.startsWith(busyPrefix)}
                          className="rounded-xl bg-cafe-800 px-3 py-2 text-sm font-medium text-white hover:bg-cafe-900 disabled:opacity-50"
                        >
                          Ban from room
                        </button>
                      )}
                      {canLockRoom && (
                        <button
                          type="button"
                          onClick={() => runAction(report, 'room-lock', {
                            body: { isLocked: true },
                          })}
                          disabled={busyId.startsWith(busyPrefix)}
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Lock room
                        </button>
                      )}
                      {canBanIp && (
                        <button
                          type="button"
                          onClick={() => runAction(report, 'ip-ban', {
                            body: {
                              subject: report.targetIpHash ? 'target' : 'reporter',
                              reason: note || `Report ${report.reason}`,
                            },
                          })}
                          disabled={busyId.startsWith(busyPrefix)}
                          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                        >
                          Ban IP
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminModerationPanel;
