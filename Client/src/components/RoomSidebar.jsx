import React, { useState } from 'react';

function RoomSidebar({
  rooms,
  publicRooms,
  currentRoomId,
  onSelectRoom,
  onCreateRoom,
  onJoinRoom,
  onJoinByCode,
  onLeaveRoom,
  onDeleteRoom,
  onToggleAnonymous,
  currentUserId,
  isLoading
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showPublicRooms, setShowPublicRooms] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(null); // room object or null
  const [leaveReason, setLeaveReason] = useState('');

  const handleRoomCreated = (room) => {
    setShowCreateModal(false);
    onSelectRoom(room);
  };

  const handleToggleAnonymous = (e, roomId) => {
    e.stopPropagation();
    onToggleAnonymous(roomId);
  };

  const handleLeaveClick = (e, room) => {
    e.stopPropagation();
    setShowLeaveModal(room);
    setLeaveReason('');
  };

  const handleConfirmLeave = () => {
    if (showLeaveModal) {
      onLeaveRoom(showLeaveModal.id, leaveReason.trim() || undefined);
      setShowLeaveModal(null);
      setLeaveReason('');
    }
  };

  return (
    <div className="w-72 bg-cafe-900 flex flex-col shadow-warm-lg relative z-10">
      {/* Header */}
      <div className="p-5 border-b border-cafe-800/50">
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7 text-cafe-300" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21h18v-2H2M20 8h-2V5h2m0-2H4a2 2 0 00-2 2v6a2 2 0 002 2h9.47a3.97 3.97 0 003.44-2H20a2 2 0 002-2V5a2 2 0 00-2-2z"/>
          </svg>
          <h2 className="text-xl font-serif font-bold text-cafe-100">The Chatroom</h2>
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {isLoading ? (
          <div className="p-5 text-cafe-400 text-sm">Loading rooms...</div>
        ) : rooms.length === 0 ? (
          <div className="p-5 text-cafe-500 text-sm leading-relaxed">
            No rooms yet. Create one or browse public rooms to get started.
          </div>
        ) : (
          <ul className="py-2">
            {rooms.map((room) => (
              <li key={room.id} className="group">
                <div
                  className={`w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 cursor-pointer
                    ${currentRoomId === room.id
                      ? 'bg-cafe-700/60 border-l-3 border-l-cafe-300'
                      : 'hover:bg-cafe-800/60 border-l-3 border-l-transparent'
                    }`}
                  onClick={() => onSelectRoom(room)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm
                    ${room.isPrivate
                      ? 'bg-gradient-to-br from-amber-800 to-amber-950'
                      : 'bg-gradient-to-br from-cafe-600 to-cafe-800'
                    }`}>
                    {room.isPrivate ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ) : room.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-cafe-100 text-sm font-medium truncate">{room.name}</p>
                      {room.unreadCount > 0 && currentRoomId !== room.id && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-amber-500 text-white rounded-full shrink-0">
                          {room.unreadCount > 99 ? '99+' : room.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-cafe-500 text-xs">
                      {room._count?.members || 0} members
                    </p>
                  </div>
                  {/* Leave room button — visible on hover */}
                  <button
                    onClick={(e) => handleLeaveClick(e, room)}
                    className="p-1.5 rounded-lg text-cafe-600 hover:bg-red-500/20 hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                    title="Leave room"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                  {/* Anonymous toggle — hidden for room-level anonymous rooms */}
                  {room.isAnonymousRoom ? (
                    <span className="text-amber-400 text-xs font-medium px-1.5 py-0.5 bg-amber-900/30 rounded-lg" title="Anonymous room">
                      Anon
                    </span>
                  ) : (
                    <button
                      onClick={(e) => handleToggleAnonymous(e, room.id)}
                      className={`p-1.5 rounded-lg transition-all duration-200 ${
                        room.userIsAnonymous
                          ? 'bg-amber-700 text-amber-100 shadow-sm'
                          : 'text-cafe-600 hover:bg-cafe-800 hover:text-cafe-300'
                      }`}
                      title={room.userIsAnonymous ? 'Anonymous mode ON' : 'Go anonymous'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {room.userIsAnonymous ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        )}
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-cafe-800/50 space-y-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full bg-cafe-700 hover:bg-cafe-600 text-cafe-100 text-sm font-medium py-2.5 px-4 rounded-xl transition-all duration-200 shadow-sm hover:shadow-warm"
        >
          + New Room
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex-1 bg-cafe-800/60 hover:bg-cafe-800 text-cafe-300 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Enter Code
          </button>
          <button
            onClick={() => setShowPublicRooms(true)}
            className="flex-1 bg-cafe-800/60 hover:bg-cafe-800 text-cafe-300 text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Browse
          </button>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateRoom}
          onRoomCreated={handleRoomCreated}
        />
      )}

      {/* Join with Code Modal */}
      {showJoinModal && (
        <JoinCodeModal
          onClose={() => setShowJoinModal(false)}
          onJoin={onJoinByCode}
          onSelectRoom={onSelectRoom}
        />
      )}

      {/* Public Rooms Modal */}
      {showPublicRooms && (
        <PublicRoomsModal
          rooms={publicRooms}
          onClose={() => setShowPublicRooms(false)}
          onJoin={onJoinRoom}
          onSelectRoom={onSelectRoom}
        />
      )}

      {/* Leave Room Confirmation Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-warm-lg border border-cafe-200/50">
            <h3 className="text-lg font-serif font-bold text-cafe-900 mb-2">Leave Room</h3>
            <p className="text-cafe-600 text-sm mb-4">
              Are you sure you want to leave <span className="font-semibold text-cafe-800">{showLeaveModal.name}</span>?
            </p>
            <input
              type="text"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="Reason for leaving (optional)"
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5 mb-4
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowLeaveModal(null); setLeaveReason(''); }}
                className="flex-1 bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLeave}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate, onRoomCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const room = await onCreate(name, description, isPrivate, isAnonymous);
      onRoomCreated(room);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-warm-lg border border-cafe-200/50">
        <h3 className="text-xl font-serif font-bold text-cafe-900 mb-4">Create a Room</h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-1">Room Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Cozy Corner"
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors"
              required
              minLength={2}
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A place to chat about..."
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors"
              maxLength={200}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="w-4 h-4 rounded accent-cafe-700"
            />
            <label htmlFor="isPrivate" className="text-cafe-700 text-sm">
              Private room (invite code required)
            </label>
          </div>

          {isPrivate && (
            <p className="text-cafe-400 text-xs">
              You can find the invite code anytime by clicking on the room name header
            </p>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isAnonymous"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-700"
            />
            <label htmlFor="isAnonymous" className="text-cafe-700 text-sm">
              Anonymous room (everyone gets random names)
            </label>
          </div>

          {isAnonymous && (
            <p className="text-amber-600 text-xs">
              All users will have random animal names. No one can reveal their identity.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-2.5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="flex-1 bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white py-2.5 rounded-xl transition-colors shadow-warm"
            >
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JoinCodeModal({ onClose, onJoin, onSelectRoom }) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const room = await onJoin(code);
      onSelectRoom(room);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-warm-lg border border-cafe-200/50">
        <h3 className="text-xl font-serif font-bold text-cafe-900 mb-4">Enter Invite Code</h3>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cafe-700 mb-1">Invite Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code..."
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 font-mono
                         tracking-widest text-center text-lg transition-colors"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-cafe-100 hover:bg-cafe-200 text-cafe-700 py-2.5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !code.trim()}
              className="flex-1 bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white py-2.5 rounded-xl transition-colors shadow-warm"
            >
              {isLoading ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PublicRoomsModal({ rooms, onClose, onJoin, onSelectRoom }) {
  const [joiningId, setJoiningId] = useState(null);

  const handleJoin = async (roomId) => {
    setJoiningId(roomId);
    try {
      const room = await onJoin(roomId);
      onSelectRoom(room);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-serif font-bold text-cafe-900">Public Rooms</h3>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <p className="text-cafe-400 text-center py-8">No public rooms available right now</p>
          ) : (
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li key={room.id} className="bg-cafe-50 border border-cafe-200/50 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-cafe-900 font-medium flex items-center gap-2">
                      {room.name}
                      {room.isAnonymous && (
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-normal">
                          Anonymous
                        </span>
                      )}
                    </p>
                    <p className="text-cafe-500 text-sm">
                      {room._count?.members || 0} members · by {room.owner?.username}
                    </p>
                    {room.description && (
                      <p className="text-cafe-400 text-sm mt-1">{room.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleJoin(room.id)}
                    disabled={joiningId === room.id}
                    className="bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300 text-white text-sm px-4 py-2 rounded-xl transition-colors shadow-sm ml-3 shrink-0"
                  >
                    {joiningId === room.id ? 'Joining...' : 'Join'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default RoomSidebar;
