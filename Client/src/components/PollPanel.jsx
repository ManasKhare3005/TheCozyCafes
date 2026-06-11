import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function PollCard({ poll, onVote, currentUserId }) {
  const [voting, setVoting] = useState(false);
  const [userVote, setUserVote] = useState(poll.userVotedOptionId);
  const hasVoted = !!userVote;

  const handleVote = async (optionId) => {
    setVoting(true);
    try {
      await onVote(poll.id, optionId);
      setUserVote(optionId);
    } finally {
      setVoting(false);
    }
  };

  // Update when poll data changes from socket
  useEffect(() => {
    setUserVote(poll.userVotedOptionId);
  }, [poll.userVotedOptionId]);

  return (
    <div className="bg-white rounded-xl border border-cafe-200/50 p-4 shadow-sm">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-lg">📊</span>
        <h4 className="font-serif font-bold text-cafe-900 text-sm leading-tight flex-1">{poll.question}</h4>
      </div>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const percentage = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
          const isSelected = userVote === option.id;

          return (
            <button
              key={option.id}
              onClick={() => !hasVoted && handleVote(option.id)}
              disabled={hasVoted || voting}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-all relative overflow-hidden ${
                hasVoted
                  ? isSelected
                    ? 'bg-cafe-100 border-2 border-cafe-500'
                    : 'bg-cafe-50 border border-cafe-200'
                  : 'bg-cafe-50 border border-cafe-200 hover:border-cafe-400 hover:bg-cafe-100 cursor-pointer'
              }`}
            >
              {/* Progress bar background */}
              {hasVoted && (
                <div
                  className="absolute inset-y-0 left-0 bg-cafe-200/50 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <span className={`${isSelected ? 'font-medium text-cafe-800' : 'text-cafe-700'}`}>
                  {option.text}
                </span>
                {hasVoted && (
                  <span className="text-xs text-cafe-500 font-medium ml-2 shrink-0">
                    {percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-cafe-400 mt-2">
        {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
      </p>
    </div>
  );
}

function CreatePollForm({ roomId, onCreated, onCancel }) {
  const { token } = useAuth();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const addOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const removeOption = (index) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError('Need at least 2 options');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/polls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, options: cleanOptions }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-cafe-200/50 p-4 shadow-sm space-y-3">
      <h4 className="font-serif font-bold text-cafe-900 text-sm flex items-center gap-2">
        <span>📊</span> Create a Poll
      </h4>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask a question..."
        required
        maxLength={200}
        className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-lg px-3 py-2
                   border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
      />

      {options.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              setOptions(next);
            }}
            placeholder={`Option ${i + 1}`}
            maxLength={100}
            className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-lg px-3 py-1.5
                       border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
          />
          {options.length > 2 && (
            <button
              type="button"
              onClick={() => removeOption(i)}
              className="text-cafe-400 hover:text-red-500 p-1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {options.length < 6 && (
        <button
          type="button"
          onClick={addOption}
          className="text-xs text-cafe-500 hover:text-cafe-700 transition-colors"
        >
          + Add option
        </button>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-sm py-2 rounded-lg bg-cafe-100 text-cafe-600 hover:bg-cafe-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={creating || !question.trim()}
          className="flex-1 text-sm py-2 rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 disabled:bg-cafe-300 transition-colors"
        >
          {creating ? 'Creating...' : 'Create Poll'}
        </button>
      </div>
    </form>
  );
}

function PollPanel({ roomId, onClose }) {
  const { token, user } = useAuth();
  const [polls, setPolls] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPolls = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/polls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPolls(data.polls);
      }
    } catch (err) {
      console.error('Failed to fetch polls:', err);
    }
  }, [roomId, token]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // Listen for real-time poll updates
  useEffect(() => {
    const handlePollCreated = (poll) => {
      setPolls((prev) => [poll, ...prev]);
    };

    const handlePollVoted = (update) => {
      setPolls((prev) =>
        prev.map((p) =>
          p.id === update.id
            ? {
                ...p,
                options: p.options.map((o) => {
                  const updated = update.options.find((uo) => uo.id === o.id);
                  return updated ? { ...o, voteCount: updated.voteCount } : o;
                }),
                totalVotes: update.totalVotes,
              }
            : p
        )
      );
    };

    socketService.onPollCreated(handlePollCreated);
    socketService.onPollVoted(handlePollVoted);

    return () => {
      socketService.offPollCreated(handlePollCreated);
      socketService.offPollVoted(handlePollVoted);
    };
  }, []);

  const handleVote = async (pollId, optionId) => {
    try {
      const res = await fetch(`${API_URL}/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ optionId }),
      });

      if (res.ok) {
        const data = await res.json();
        setPolls((prev) =>
          prev.map((p) =>
            p.id === pollId
              ? { ...p, ...data.poll, userVotedOptionId: data.userVotedOptionId }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Polls</h3>
          </div>
          <div className="flex items-center gap-2">
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-sm px-3 py-1.5 rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 transition-colors"
              >
                + New Poll
              </button>
            )}
            <button
              onClick={onClose}
              className="text-cafe-400 hover:text-cafe-700 transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {showCreate && (
            <CreatePollForm
              roomId={roomId}
              onCreated={() => { setShowCreate(false); fetchPolls(); }}
              onCancel={() => setShowCreate(false)}
            />
          )}
          {polls.length === 0 && !showCreate ? (
            <div className="flex flex-col items-center justify-center h-full text-cafe-400">
              <span className="text-4xl mb-3">📊</span>
              <p className="font-serif text-lg text-cafe-500">No polls yet</p>
              <p className="text-sm mt-1">Create one to get the conversation going!</p>
            </div>
          ) : (
            polls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                onVote={handleVote}
                currentUserId={user.id}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default PollPanel;
