import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function KickVotePanel({ roomId, isAdmin, ownerId, onClose }) {
  const { user, token } = useAuth();
  const [members, setMembers] = useState([]);
  const [activeVotes, setActiveVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kickReason, setKickReason] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showConfirm, setShowConfirm] = useState(null);
  const [error, setError] = useState(null);
  const [friendships, setFriendships] = useState({}); // userId -> { status, id }
  const [friendLoading, setFriendLoading] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, votesRes, friendsRes] = await Promise.all([
        fetch(`${API_URL}/rooms/${roomId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/rooms/${roomId}/votes`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/friends`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members);
      }

      if (votesRes.ok) {
        const data = await votesRes.json();
        setActiveVotes(data.votes);
      }

      if (friendsRes.ok) {
        const data = await friendsRes.json();
        const map = {};
        for (const { friendshipId, friend } of data.friends) {
          map[friend.id] = { status: 'accepted', id: friendshipId };
        }
        // Also fetch pending requests
        const reqRes = await fetch(`${API_URL}/friends/requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (reqRes.ok) {
          const reqData = await reqRes.json();
          for (const req of reqData.outgoing) {
            map[req.addressee.id] = { status: 'pending', id: req.id };
          }
          for (const req of reqData.incoming) {
            map[req.requester.id] = { status: 'incoming', id: req.id };
          }
        }
        setFriendships(map);
      }
    } catch (err) {
      setError('Failed to load data');
    }
  }, [roomId, token]);

  const handleAddFriend = async (memberId, memberUsername) => {
    setFriendLoading(prev => ({ ...prev, [memberId]: true }));
    try {
      const res = await fetch(`${API_URL}/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addresseeId: memberId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFriendships(prev => ({ ...prev, [memberId]: { status: 'pending', id: data.friendship.id } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setFriendLoading(prev => ({ ...prev, [memberId]: false }));
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    };
    loadData();
  }, [fetchData]);

  useEffect(() => {
    const handleVoteUpdate = (data) => {
      if (data.type === 'started') {
        setActiveVotes(prev => [...prev, data.vote]);
        fetchData();
      } else if (data.type === 'updated') {
        setActiveVotes(prev => prev.map(v =>
          v.id === data.vote.id ? { ...v, ...data.vote } : v
        ));
      } else if (data.type === 'resolved') {
        setActiveVotes(prev => prev.filter(v => v.id !== data.vote.id));
        fetchData();
      }
    };

    const handleUserLeft = () => fetchData();
    const handleUsersUpdated = () => fetchData();
    const handleIdentityRevealed = () => fetchData();

    socketService.onKickVoteUpdated(handleVoteUpdate);
    socketService.socket?.on('user:left', handleUserLeft);
    socketService.onRoomUsersUpdated(handleUsersUpdated);
    socketService.onIdentityRevealed(handleIdentityRevealed);

    return () => {
      socketService.offKickVoteUpdated(handleVoteUpdate);
      socketService.socket?.off('user:left', handleUserLeft);
      socketService.offRoomUsersUpdated(handleUsersUpdated);
      socketService.offIdentityRevealed(handleIdentityRevealed);
    };
  }, [fetchData]);

  const handleAdminKick = async () => {
    if (!selectedMember) return;
    const targetId = selectedMember.realUserId || selectedMember.userId;

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: targetId,
          reason: kickReason || 'Kicked by admin',
        }),
      });

      if (res.ok) {
        setShowConfirm(null);
        setSelectedMember(null);
        setKickReason('');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to kick user');
    }
  };

  const handleStartVoteKick = async () => {
    if (!selectedMember) return;
    const targetId = selectedMember.realUserId || selectedMember.userId;

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/vote-kick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: targetId,
          reason: kickReason || 'Vote kick initiated',
        }),
      });

      if (res.ok) {
        setShowConfirm(null);
        setSelectedMember(null);
        setKickReason('');
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to start vote');
    }
  };

  const handleCastVote = async (voteId, vote) => {
    try {
      const res = await fetch(`${API_URL}/votes/${voteId}/cast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vote }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to cast vote');
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m remaining`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-warm-lg">
          <div className="flex items-center justify-center">
            <svg className="animate-spin h-8 w-8 text-cafe-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-warm-lg border border-cafe-200/50">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-serif font-bold text-cafe-900">Manage Members</h2>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl mb-4 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {/* Active Votes Section */}
        {activeVotes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-base font-serif font-semibold text-cafe-800 mb-3">Active Votes</h3>
            <div className="space-y-3">
              {activeVotes.map(vote => (
                <div key={vote.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-cafe-900 font-medium">
                        Vote to kick: <span className="text-red-600">{vote.target.username}</span>
                      </p>
                      {vote.reason && (
                        <p className="text-cafe-500 text-sm">Reason: {vote.reason}</p>
                      )}
                      <p className="text-cafe-400 text-xs">
                        Started by {vote.initiator.username} · {formatTimeRemaining(vote.expiresAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex-1 bg-cafe-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-red-500 h-full transition-all"
                        style={{ width: `${(vote.votesFor / vote.eligibleVoters) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-cafe-500">
                      {vote.votesFor}/{vote.majorityThreshold} to kick
                    </span>
                  </div>

                  {vote.target?.id !== user.id && !vote.hasVoted && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleCastVote(vote.id, true)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-xl text-sm transition-colors"
                      >
                        Vote Kick
                      </button>
                      <button
                        onClick={() => handleCastVote(vote.id, false)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-xl text-sm transition-colors"
                      >
                        Vote Keep
                      </button>
                    </div>
                  )}

                  {vote.hasVoted && (
                    <p className="text-cafe-500 text-sm mt-2">
                      You voted to {vote.myVote ? 'kick' : 'keep'}
                    </p>
                  )}

                  {vote.target?.id === user.id && (
                    <p className="text-amber-700 text-sm mt-2 font-medium">
                      This vote is about you
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members List */}
        <h3 className="text-base font-serif font-semibold text-cafe-800 mb-3">Members</h3>
        <div className="space-y-2">
          {members.map(member => {
            const isOwner = member.isOwner || member.userId === ownerId || member.realUserId === ownerId;
            const isSelf = member.userId === user.id || member.realUserId === user.id;
            const userIdForVote = member.realUserId || member.userId;
            const hasActiveVote = activeVotes.some(v => v.target?.id === userIdForVote);
            const canKickOrVote = !isOwner && !isSelf && !hasActiveVote && !member.userId?.startsWith('anon-');

            return (
              <div
                key={member.userId}
                className={`flex items-center justify-between p-3 rounded-xl ${
                  member.isRevealed ? 'bg-amber-50 border border-amber-200' :
                  member.isAnonymous ? 'bg-cafe-50 border border-cafe-200/50' : 'bg-cafe-50 border border-cafe-200/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                    member.isAnonymous ? 'bg-amber-600' : 'bg-cafe-600'
                  }`}>
                    {member.isAnonymous ? '?' : member.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-cafe-900 font-medium flex items-center gap-2">
                      {member.username}
                      {isOwner && <span className="text-xs bg-cafe-700 text-white px-2 py-0.5 rounded-lg">Admin</span>}
                      {member.isRevealed && <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-lg">Revealed</span>}
                      {member.isAnonymous && !member.isRevealed && <span className="text-xs bg-amber-500/20 text-amber-700 px-2 py-0.5 rounded-lg">Anonymous</span>}
                      {isSelf && <span className="text-xs bg-cafe-200 text-cafe-600 px-2 py-0.5 rounded-lg">You</span>}
                    </p>
                    {isSelf && member.isAnonymous && (
                      <p className="text-amber-600 text-xs">You ({user.username})</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Add Friend button */}
                  {!isSelf && !member.isAnonymous && (() => {
                    const realId = member.realUserId || member.userId;
                    const fs = friendships[realId];
                    if (fs?.status === 'accepted') {
                      return (
                        <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full font-medium">
                          Friends
                        </span>
                      );
                    }
                    if (fs?.status === 'pending') {
                      return (
                        <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full font-medium">
                          Pending
                        </span>
                      );
                    }
                    if (fs?.status === 'incoming') {
                      return (
                        <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full font-medium">
                          Respond in Friends tab
                        </span>
                      );
                    }
                    return (
                      <button
                        onClick={() => handleAddFriend(realId, member.username)}
                        disabled={friendLoading[realId]}
                        className="text-[11px] bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-1 px-2.5 rounded-lg transition-colors font-medium disabled:opacity-50"
                        title={`Add ${member.username} as friend`}
                      >
                        {friendLoading[realId] ? '...' : '+ Friend'}
                      </button>
                    );
                  })()}

                  {canKickOrVote && (
                    <>
                      {isAdmin ? (
                        <button
                          onClick={() => {
                            const kickUserId = member.realUserId || member.userId;
                            setSelectedMember({
                              ...member,
                              realUserId: kickUserId,
                            });
                            setShowConfirm('kick');
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white text-sm py-1.5 px-3 rounded-xl transition-colors"
                        >
                          Kick
                        </button>
                      ) : (
                        !member.isAnonymous && (
                          <button
                            onClick={() => {
                              setSelectedMember(member);
                              setShowConfirm('vote');
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-sm py-1.5 px-3 rounded-xl transition-colors"
                          >
                            Vote Kick
                          </button>
                        )
                      )}
                    </>
                  )}

                  {hasActiveVote && !isOwner && !isSelf && (
                    <span className="text-amber-600 text-sm">Vote in progress</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirm Dialog */}
        {showConfirm && selectedMember && (
          <div className="fixed inset-0 bg-cafe-900/60 modal-backdrop flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-warm-lg border border-cafe-200/50">
              <h3 className="text-lg font-serif font-bold text-cafe-900 mb-4">
                {showConfirm === 'kick' ? 'Kick User' : 'Start Vote Kick'}
              </h3>
              <p className="text-cafe-700 mb-4 text-sm">
                {showConfirm === 'kick'
                  ? `Are you sure you want to kick ${selectedMember.username}? They will be permanently banned from this room.`
                  : `Start a vote to kick ${selectedMember.username}? If majority votes to kick, they will be permanently banned.`
                }
              </p>

              <input
                type="text"
                placeholder="Reason (optional)"
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5 mb-4
                           border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirm(null);
                    setSelectedMember(null);
                    setKickReason('');
                  }}
                  className="flex-1 bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-2.5 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={showConfirm === 'kick' ? handleAdminKick : handleStartVoteKick}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl transition-colors"
                >
                  {showConfirm === 'kick' ? 'Kick' : 'Start Vote'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default KickVotePanel;
