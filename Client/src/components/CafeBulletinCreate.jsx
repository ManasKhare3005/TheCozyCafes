import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function CafeBulletinCreate({ roomId, onClose }) {
  const { token } = useAuth();
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError('');
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/bulletins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId, text: text.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-warm-lg border border-cafe-200/50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">📢</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Post a Bulletin</h3>
          </div>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <p className="text-xs text-cafe-500">
            Write a one-liner to promote your room on the cafe lobby. It'll be visible to everyone for 24 hours.
          </p>
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Movie night at 8pm! Everyone welcome..."
            maxLength={120}
            autoFocus
            className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-cafe-400">{text.length}/120</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg bg-cafe-100 text-cafe-600 hover:bg-cafe-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !text.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 disabled:bg-cafe-300 transition-colors"
              >
                {creating ? 'Posting...' : 'Post Bulletin'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CafeBulletinCreate;
