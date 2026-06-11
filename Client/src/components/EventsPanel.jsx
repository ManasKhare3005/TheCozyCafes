import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function CountdownTimer({ scheduledAt }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(scheduledAt) - new Date();
      if (diff <= 0) {
        setTimeLeft('Now!');
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);

      if (days > 0) setTimeLeft(`${days}d ${hours}h`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m`);
      else setTimeLeft(`${mins}m`);
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [scheduledAt]);

  return <span>{timeLeft}</span>;
}

function EventsPanel({ roomId, onClose }) {
  const { user, token } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [posting, setPosting] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, token]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Real-time updates
  useEffect(() => {
    const socket = socketService.socket;
    const handleCreated = (event) => {
      setEvents((prev) => [...prev, event].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)));
    };
    const handleUpdated = (event) => {
      setEvents((prev) => prev.map((e) => e.id === event.id ? event : e));
    };
    const handleDeleted = ({ id }) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    };

    socket?.on('event:created', handleCreated);
    socket?.on('event:updated', handleUpdated);
    socket?.on('event:deleted', handleDeleted);
    return () => {
      socket?.off('event:created', handleCreated);
      socket?.off('event:updated', handleUpdated);
      socket?.off('event:deleted', handleDeleted);
    };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !scheduledAt) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, description, scheduledAt }),
      });
      if (res.ok) {
        setTitle('');
        setDescription('');
        setScheduledAt('');
        setShowCreate(false);
      }
    } catch (err) {
      console.error('Failed to create event:', err);
    } finally {
      setPosting(false);
    }
  };

  const handleRsvp = async (eventId, status) => {
    try {
      await fetch(`${API_URL}/rooms/${roomId}/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('RSVP failed:', err);
    }
  };

  const handleDelete = async (eventId) => {
    try {
      await fetch(`${API_URL}/rooms/${roomId}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Delete event failed:', err);
    }
  };

  const isPast = (date) => new Date(date) < new Date();

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Events</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="text-sm bg-cafe-700 hover:bg-cafe-800 text-white px-3 py-1.5 rounded-xl transition-colors"
            >
              + New
            </button>
            <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="p-4 border-b border-cafe-200/50 bg-cafe-50 space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              maxLength={100}
              className="w-full bg-white text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              maxLength={200}
              className="w-full bg-white text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-xs"
            />
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="flex-1 bg-white text-cafe-900 rounded-xl px-4 py-2
                           border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
              />
              <button
                type="submit"
                disabled={posting || !title.trim() || !scheduledAt}
                className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400
                           text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-warm shrink-0"
              >
                Create
              </button>
            </div>
          </form>
        )}

        {/* Events list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-center text-cafe-400 py-8">Loading...</p>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-3">📅</span>
              <p className="text-cafe-500 font-serif">No events yet</p>
              <p className="text-cafe-400 text-sm mt-1">Create one to get the table together</p>
            </div>
          ) : (
            events.map((event) => {
              const past = isPast(event.scheduledAt);
              const myRsvp = event.rsvps?.find((r) => r.user?.id === user.id);
              const goingCount = event.rsvps?.filter((r) => r.status === 'going').length || 0;
              const maybeCount = event.rsvps?.filter((r) => r.status === 'maybe').length || 0;

              return (
                <div
                  key={event.id}
                  className={`rounded-xl border p-4 ${past ? 'bg-cafe-50 border-cafe-200/50 opacity-60' : 'bg-white border-cafe-200 shadow-sm'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-cafe-900 text-sm">{event.title}</h4>
                      {event.description && (
                        <p className="text-xs text-cafe-500 mt-0.5">{event.description}</p>
                      )}
                    </div>
                    {!past && (
                      <div className="bg-cafe-100 text-cafe-700 text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0">
                        <CountdownTimer scheduledAt={event.scheduledAt} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-[11px] text-cafe-400">
                    <span>{new Date(event.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>·</span>
                    <span>by {event.creator?.username}</span>
                    {goingCount > 0 && <><span>·</span><span className="text-green-600">{goingCount} going</span></>}
                    {maybeCount > 0 && <><span>·</span><span className="text-amber-600">{maybeCount} maybe</span></>}
                  </div>

                  {/* RSVP buttons */}
                  {!past && (
                    <div className="flex items-center gap-1.5 mt-3">
                      {['going', 'maybe', 'not_going'].map((status) => {
                        const labels = { going: 'Going', maybe: 'Maybe', not_going: 'Can\'t' };
                        const colors = {
                          going: myRsvp?.status === 'going' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-cafe-50 text-cafe-500 border-cafe-200',
                          maybe: myRsvp?.status === 'maybe' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-cafe-50 text-cafe-500 border-cafe-200',
                          not_going: myRsvp?.status === 'not_going' ? 'bg-red-100 text-red-600 border-red-300' : 'bg-cafe-50 text-cafe-500 border-cafe-200',
                        };
                        return (
                          <button
                            key={status}
                            onClick={() => handleRsvp(event.id, status)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 ${colors[status]}`}
                          >
                            {labels[status]}
                          </button>
                        );
                      })}

                      {(event.creator?.id === user.id) && (
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="ml-auto text-cafe-400 hover:text-red-500 transition-colors p-1"
                          title="Delete event"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default EventsPanel;
