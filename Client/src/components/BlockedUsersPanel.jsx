import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function userLabel(user) {
  if (!user) return 'Unknown user';
  return `${user.username}#${user.discriminator || '0000'}`;
}

function BlockedUsersPanel({ token, onClose }) {
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const fetchBlocks = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/moderation/blocks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load blocked users');
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, []);

  const unblock = async (blockedUserId) => {
    setBusyId(blockedUserId);
    setError('');
    try {
      const res = await fetch(`${API_URL}/moderation/blocks/${blockedUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unblock user');
      setBlocks((current) => current.filter((block) => block.blockedId !== blockedUserId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="min-h-screen bg-cafe-50 cafe-texture text-cafe-900">
      <header className="sticky top-0 z-20 border-b border-cafe-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-cafe-400">Safety</p>
            <h1 className="font-serif text-2xl font-bold text-cafe-900">Blocked Users</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-cafe-800 px-3 py-2 text-sm font-medium text-white hover:bg-cafe-900"
          >
            Back
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-xl border border-cafe-200 bg-white px-4 py-10 text-center text-cafe-500">
            Loading blocked users...
          </div>
        ) : blocks.length === 0 ? (
          <div className="rounded-xl border border-cafe-200 bg-white px-4 py-10 text-center text-cafe-500">
            No blocked users.
          </div>
        ) : (
          <div className="grid gap-3">
            {blocks.map((block) => (
              <article
                key={block.id}
                className="flex flex-col gap-3 rounded-xl border border-cafe-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cafe-100 font-serif font-bold text-cafe-700">
                    {(block.blocked?.username || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-cafe-900">{userLabel(block.blocked)}</p>
                    <p className="text-xs text-cafe-400">
                      Blocked {new Date(block.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => unblock(block.blockedId)}
                  disabled={busyId === block.blockedId}
                  className="rounded-xl border border-cafe-200 px-3 py-2 text-sm font-medium text-cafe-700 hover:bg-cafe-50 disabled:opacity-50"
                >
                  Unblock
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default BlockedUsersPanel;
