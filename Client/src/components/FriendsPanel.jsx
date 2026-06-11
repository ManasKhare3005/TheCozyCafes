import React, { useState } from 'react';

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || name.slice(0, 2).toUpperCase();
}

const MOOD_CONFIG = {
  chill: { emoji: '😌', label: 'Chill', color: 'text-teal-600' },
  busy: { emoji: '🔴', label: 'Busy', color: 'text-red-500' },
  caffeinated: { emoji: '☕', label: 'Caffeinated', color: 'text-amber-700' },
  sleepy: { emoji: '😴', label: 'Sleepy', color: 'text-indigo-500' },
  creative: { emoji: '🎨', label: 'Creative', color: 'text-purple-600' },
  chatty: { emoji: '💬', label: 'Chatty', color: 'text-green-600' },
  focused: { emoji: '🎯', label: 'Focused', color: 'text-blue-600' },
  vibing: { emoji: '🎵', label: 'Vibing', color: 'text-pink-500' },
};

function MoodBadge({ mood, isOnline }) {
  if (!isOnline) {
    return <span className="text-xs text-cafe-400">Offline</span>;
  }
  if (!mood) {
    return <span className="text-xs text-green-600">Online</span>;
  }
  const m = MOOD_CONFIG[mood];
  if (!m) return <span className="text-xs text-green-600">Online</span>;
  return (
    <span className={`text-xs ${m.color} flex items-center gap-1`}>
      <span>{m.emoji}</span> {m.label}
    </span>
  );
}

function FriendsPanel({
  friends,
  incomingRequests,
  outgoingRequests,
  onlineFriendIds = new Set(),
  friendMoods = {},
  friendStatuses = {},
  onSelectFriend,
  onSendRequest,
  onRespondToRequest,
  onRemoveFriend,
  onSearchUsers,
}) {
  const [subTab, setSubTab] = useState('friends'); // 'friends' | 'requests' | 'find'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [requestUsername, setRequestUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await onSearchUsers(q);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (username) => {
    setSending(true);
    setError('');
    setSuccess('');
    try {
      await onSendRequest(username);
      setSuccess(`Friend request sent to ${username}!`);
      setRequestUsername('');
      // Update search results
      if (searchResults.length > 0) {
        setSearchResults((prev) =>
          prev.map((u) =>
            u.username === username
              ? { ...u, friendship: { status: 'pending', isIncoming: false } }
              : u
          )
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleRespond = async (friendshipId, action) => {
    try {
      await onRespondToRequest(friendshipId, action);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-cafe-100 rounded-xl p-1 mb-6">
        <button
          onClick={() => setSubTab('friends')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            subTab === 'friends' ? 'bg-white text-cafe-900 shadow-sm' : 'text-cafe-500 hover:text-cafe-700'
          }`}
        >
          Friends{friends.length > 0 && <span className="ml-1.5 text-cafe-400 text-xs">({friends.length})</span>}
        </button>
        <button
          onClick={() => setSubTab('requests')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative ${
            subTab === 'requests' ? 'bg-white text-cafe-900 shadow-sm' : 'text-cafe-500 hover:text-cafe-700'
          }`}
        >
          Requests
          {incomingRequests.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-red-500 text-white rounded-full">
              {incomingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('find')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            subTab === 'find' ? 'bg-white text-cafe-900 shadow-sm' : 'text-cafe-500 hover:text-cafe-700'
          }`}
        >
          Find People
        </button>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl mb-4 text-sm">
          {error}
          <button onClick={() => setError('')} className="float-right text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-xl mb-4 text-sm">
          {success}
          <button onClick={() => setSuccess('')} className="float-right text-green-400 hover:text-green-600">&times;</button>
        </div>
      )}

      {/* Friends list */}
      {subTab === 'friends' && (
        <div>
          {friends.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-cafe-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">👋</span>
              </div>
              <p className="text-cafe-700 font-serif text-lg mb-1">No friends yet</p>
              <p className="text-cafe-400 text-sm mb-4">Find people and send them a friend request!</p>
              <button
                onClick={() => setSubTab('find')}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-cafe-700 text-white hover:bg-cafe-800 transition-colors shadow-warm"
              >
                Find People
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {[...friends]
                .sort((a, b) => {
                  const aOnline = onlineFriendIds.has(a.friend.id) ? 1 : 0;
                  const bOnline = onlineFriendIds.has(b.friend.id) ? 1 : 0;
                  return bOnline - aOnline;
                })
                .map(({ friendshipId, friend, unreadCount }) => {
                  const isOnline = onlineFriendIds.has(friend.id);
                  return (
                    <div
                      key={friendshipId}
                      className="group flex items-center gap-3 bg-white rounded-xl border border-cafe-200/50 p-3
                                 hover:shadow-warm transition-all duration-200 cursor-pointer"
                      onClick={() => onSelectFriend(friend)}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                                        flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm">
                          {getInitials(friend.username)}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                          isOnline ? 'bg-green-500' : 'bg-cafe-300'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-cafe-900 text-sm truncate">
                          {friend.username}
                          <span className="text-cafe-400 font-normal text-xs">#{friend.discriminator || '0000'}</span>
                        </p>
                        <MoodBadge mood={friendMoods[friend.id]} isOnline={isOnline} />
                        {friendStatuses[friend.id] && (
                          <p className="text-[11px] text-cafe-400 truncate italic">{friendStatuses[friend.id]}</p>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-amber-500 text-white rounded-full shrink-0">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectFriend(friend);
                        }}
                        className="bg-cafe-700 hover:bg-cafe-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Message
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Requests */}
      {subTab === 'requests' && (
        <div className="space-y-6">
          {/* Incoming */}
          <div>
            <h4 className="text-sm font-medium text-cafe-600 mb-3">
              Incoming{incomingRequests.length > 0 && ` (${incomingRequests.length})`}
            </h4>
            {incomingRequests.length === 0 ? (
              <p className="text-cafe-400 text-sm py-4 text-center">No incoming requests</p>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 bg-white rounded-xl border border-cafe-200/50 p-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                                    flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm shrink-0">
                      {getInitials(req.requester.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-cafe-900 text-sm truncate">
                        {req.requester.username}
                        <span className="text-cafe-400 font-normal text-xs">#{req.requester.discriminator || '0000'}</span>
                      </p>
                      <p className="text-xs text-cafe-400">wants to be friends</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleRespond(req.id, 'accept')}
                        className="bg-cafe-700 hover:bg-cafe-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, 'decline')}
                        className="bg-cafe-100 hover:bg-cafe-200 text-cafe-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing */}
          <div>
            <h4 className="text-sm font-medium text-cafe-600 mb-3">
              Sent{outgoingRequests.length > 0 && ` (${outgoingRequests.length})`}
            </h4>
            {outgoingRequests.length === 0 ? (
              <p className="text-cafe-400 text-sm py-4 text-center">No pending requests</p>
            ) : (
              <div className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 bg-white rounded-xl border border-cafe-200/50 p-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                                    flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm shrink-0">
                      {getInitials(req.addressee.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-cafe-900 text-sm truncate">
                        {req.addressee.username}
                        <span className="text-cafe-400 font-normal text-xs">#{req.addressee.discriminator || '0000'}</span>
                      </p>
                    </div>
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Find People */}
      {subTab === 'find' && (
        <div>
          {/* Quick add by username */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-cafe-700 mb-2">Add by username</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (requestUsername.trim()) handleSendRequest(requestUsername.trim());
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={requestUsername}
                onChange={(e) => setRequestUsername(e.target.value)}
                placeholder="Enter username#0000..."
                className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                           border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !requestUsername.trim()}
                className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-warm shrink-0"
              >
                {sending ? '...' : 'Add'}
              </button>
            </form>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-2">Search people</label>
            <div className="bg-white rounded-xl border border-cafe-200 px-4 py-2.5 flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-cafe-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by username..."
                className="flex-1 bg-transparent text-cafe-900 placeholder-cafe-400 outline-none text-sm"
              />
            </div>

            {searching && <p className="text-cafe-400 text-sm text-center py-4">Searching...</p>}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <p className="text-cafe-400 text-sm text-center py-4">No users found</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 bg-white rounded-xl border border-cafe-200/50 p-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cafe-300 to-cafe-600
                                    flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm shrink-0">
                      {getInitials(user.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-cafe-900 text-sm truncate">
                        {user.username}
                        <span className="text-cafe-400 font-normal">#{user.discriminator || '0000'}</span>
                      </p>
                    </div>
                    {user.friendship?.status === 'accepted' ? (
                      <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                        Friends
                      </span>
                    ) : user.friendship?.status === 'pending' ? (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                        {user.friendship.isIncoming ? 'Respond' : 'Pending'}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(user.username)}
                        disabled={sending}
                        className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Add Friend
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendsPanel;
