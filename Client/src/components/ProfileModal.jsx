import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const MOOD_CONFIG = {
  chill: { emoji: '😌', label: 'Chill' },
  busy: { emoji: '🔴', label: 'Busy' },
  caffeinated: { emoji: '☕', label: 'Caffeinated' },
  sleepy: { emoji: '😴', label: 'Sleepy' },
  creative: { emoji: '🎨', label: 'Creative' },
  chatty: { emoji: '💬', label: 'Chatty' },
  focused: { emoji: '🎯', label: 'Focused' },
  vibing: { emoji: '🎵', label: 'Vibing' },
};

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase();
}

function ProfileModal({ userId, token, onClose, isOwnProfile = false, onAccountDeleted }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/users/${userId}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data.user);
          setBio(data.user.bio || '');
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
        setEditing(false);
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_URL}/users/me/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to export account data');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
        || `chat-room-cafe-export-${Date.now()}.json`;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: deletePassword,
          confirmation: deleteConfirmation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }
      onAccountDeleted?.();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const mood = profile?.mood ? MOOD_CONFIG[profile.mood] : null;
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-warm-lg border border-cafe-200/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-12 text-center text-cafe-400">Loading...</div>
        ) : !profile ? (
          <div className="p-12 text-center text-cafe-400">User not found</div>
        ) : (
          <>
            {/* Profile header with gradient */}
            <div className="bg-gradient-to-br from-cafe-600 to-cafe-800 p-6 pb-12 relative">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Avatar overlapping header */}
            <div className="relative -mt-10 px-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cafe-300 to-cafe-600
                              flex items-center justify-center text-white font-serif font-bold text-2xl
                              shadow-warm-lg border-4 border-white">
                {profile.avatar ? (
                  <img src={profile.avatar} alt="" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  getInitials(profile.username)
                )}
              </div>
            </div>

            {/* Profile info */}
            <div className="px-6 pt-3 pb-6">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-serif font-bold text-cafe-900">
                  {profile.username}
                  <span className="text-cafe-400 font-normal text-base">#{profile.discriminator || '0000'}</span>
                </h2>
                {mood && (
                  <span className="text-sm bg-cafe-50 border border-cafe-200 px-2 py-0.5 rounded-full">
                    {mood.emoji} {mood.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-cafe-400 mb-4">Joined {joinDate}</p>

              {/* Bio */}
              {editing ? (
                <div className="space-y-2 mb-4">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={200}
                    rows={3}
                    placeholder="Write something about yourself..."
                    className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                               border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300
                               text-sm resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cafe-400">{bio.length}/200</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditing(false); setBio(profile.bio || ''); }}
                        className="text-sm px-3 py-1.5 rounded-lg bg-cafe-100 text-cafe-600 hover:bg-cafe-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-sm px-3 py-1.5 rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 disabled:bg-cafe-300 transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-sm text-cafe-600 leading-relaxed">
                    {profile.bio || (isOwnProfile ? 'No bio yet. Click edit to add one.' : 'No bio yet.')}
                  </p>
                  {isOwnProfile && (
                    <button
                      onClick={() => setEditing(true)}
                      className="mt-2 text-xs text-cafe-500 hover:text-cafe-700 transition-colors"
                    >
                      Edit bio
                    </button>
                  )}
                </div>
              )}

              {/* Stats placeholder */}
              <div className="flex gap-4 pt-3 border-t border-cafe-100">
                <div className="text-center flex-1">
                  <span className="text-2xl">☕</span>
                  <p className="text-[10px] text-cafe-400 mt-0.5">Cafe Regular</p>
                </div>
              </div>

              {isOwnProfile && (
                <div className="pt-4 mt-4 border-t border-cafe-100 space-y-3">
                  {deleteError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                      {deleteError}
                    </div>
                  )}

                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="w-full text-sm px-3 py-2 rounded-lg bg-cafe-50 text-cafe-700 hover:bg-cafe-100 disabled:opacity-60 transition-colors border border-cafe-200"
                  >
                    {exporting ? 'Preparing export...' : 'Download my data'}
                  </button>

                  {!showDelete ? (
                    <button
                      onClick={() => setShowDelete(true)}
                      className="w-full text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-100"
                    >
                      Delete account
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Password"
                        className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-lg px-3 py-2 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-red-200 text-sm"
                      />
                      <input
                        type="text"
                        value={deleteConfirmation}
                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                        placeholder="Type DELETE"
                        className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-lg px-3 py-2 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-red-200 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowDelete(false);
                            setDeletePassword('');
                            setDeleteConfirmation('');
                            setDeleteError('');
                          }}
                          className="flex-1 text-sm px-3 py-2 rounded-lg bg-cafe-100 text-cafe-600 hover:bg-cafe-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          className="flex-1 text-sm px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ProfileModal;
