import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function DrawingGallery({ roomId, onClose, onOpenBoard }) {
  const { token } = useAuth();
  const [drawings, setDrawings] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/drawings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load gallery');
      const data = await res.json();
      setDrawings(data.drawings || []);
      setCanManage(Boolean(data.canManage));
    } catch (error) {
      console.error('Failed to fetch drawing gallery:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return undefined;

    const handleNew = (drawing) => {
      setDrawings((prev) => [drawing, ...prev.filter((item) => item.id !== drawing.id)]);
    };
    const handleRemoved = ({ id }) => {
      setDrawings((prev) => prev.filter((item) => item.id !== id));
      setSelected((prev) => (prev?.id === id ? null : prev));
    };

    socket.on('drawing:gallery:new', handleNew);
    socket.on('drawing:gallery:removed', handleRemoved);
    return () => {
      socket.off('drawing:gallery:new', handleNew);
      socket.off('drawing:gallery:removed', handleRemoved);
    };
  }, []);

  const handleDelete = async (drawingId) => {
    if (!canManage) return;
    if (!window.confirm('Delete this drawing from the room gallery?')) return;

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/drawings/${drawingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete drawing');
      }
    } catch (error) {
      alert(error.message || 'Failed to delete drawing');
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[86vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Drawing Gallery</h3>
            <p className="text-xs text-cafe-400">Saved table doodles and napkin sketches</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenBoard}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cafe-700 text-white hover:bg-cafe-800 transition-colors"
            >
              Open Board
            </button>
            <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="min-h-0 overflow-y-auto p-4 bg-cafe-50/60">
            {loading ? (
              <p className="text-center text-cafe-400 py-12">Loading...</p>
            ) : drawings.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-cafe-500 font-serif text-lg">No saved drawings yet</p>
                <p className="text-cafe-400 text-sm mt-1">Open the board, draw something, then save it here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {drawings.map((drawing) => (
                  <button
                    key={drawing.id}
                    onClick={() => setSelected(drawing)}
                    className={`group text-left rounded-xl bg-white border shadow-sm overflow-hidden transition-all hover:border-cafe-300 hover:shadow-warm ${
                      selected?.id === drawing.id ? 'border-cafe-500 ring-2 ring-cafe-200' : 'border-cafe-200/60'
                    }`}
                  >
                    <img
                      src={drawing.imageData}
                      alt={drawing.title || 'Saved drawing'}
                      className="w-full aspect-[8/5] object-cover bg-[#fffbeb]"
                    />
                    <div className="p-3">
                      <p className="text-sm font-semibold text-cafe-800 truncate">
                        {drawing.title || 'Untitled drawing'}
                      </p>
                      <p className="text-[11px] text-cafe-400 mt-0.5">
                        by {drawing.author?.username || 'Unknown'} - {new Date(drawing.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-cafe-200/50 bg-white min-h-0 flex flex-col">
            {selected ? (
              <>
                <div className="p-4 border-b border-cafe-200/50">
                  <p className="text-sm font-semibold text-cafe-900">{selected.title || 'Untitled drawing'}</p>
                  <p className="text-xs text-cafe-400 mt-1">
                    Saved by {selected.author?.username || 'Unknown'} on {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-4 bg-cafe-50/60">
                  <img
                    src={selected.imageData}
                    alt={selected.title || 'Saved drawing'}
                    className="w-full rounded-xl border border-cafe-200 bg-[#fffbeb] shadow-inner"
                  />
                </div>
                {canManage && (
                  <div className="p-4 border-t border-cafe-200/50">
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="w-full rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Delete from Gallery
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div>
                  <p className="font-serif text-lg text-cafe-500">Pick a drawing</p>
                  <p className="text-sm text-cafe-400 mt-1">Saved sketches appear here for a closer look.</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default DrawingGallery;
