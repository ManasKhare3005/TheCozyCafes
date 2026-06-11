import React, { useState } from 'react';

function RoomInfo({ room, onClose, onLeave, onDelete, currentUserId }) {
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [copied, setCopied] = useState(false);

  const isOwner = room.ownerId === currentUserId || room.owner?.id === currentUserId;

  const copyInviteCode = () => {
    if (room.code) {
      navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = async () => {
    await onLeave(room.id, leaveReason.trim() || undefined);
    onClose();
  };

  const handleDelete = async () => {
    await onDelete(room.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/40 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-warm-lg border border-cafe-200/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-serif font-bold text-cafe-900">Room Info</h3>
          <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Room icon and name */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl text-white font-serif font-bold shadow-warm
              ${room.isPrivate
                ? 'bg-gradient-to-br from-amber-800 to-amber-950'
                : 'bg-gradient-to-br from-cafe-600 to-cafe-800'
              }`}>
              {room.isPrivate ? (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : room.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="text-lg font-serif font-bold text-cafe-900">{room.name}</h4>
              <p className="text-cafe-500 text-sm">
                {room.isPrivate ? 'Private room' : 'Public room'}
                {isOwner && ' · You are the admin'}
              </p>
            </div>
          </div>

          {/* Description */}
          {room.description && (
            <div>
              <p className="text-cafe-400 text-sm mb-1">Description</p>
              <p className="text-cafe-800">{room.description}</p>
            </div>
          )}

          {/* Owner */}
          <div>
            <p className="text-cafe-400 text-sm mb-1">Created by</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-cafe-200 rounded-full flex items-center justify-center text-xs text-cafe-700">
                {(room.owner?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <p className="text-cafe-800">{room.owner?.username || 'Unknown'}</p>
              {isOwner && <span className="text-xs bg-cafe-700 text-white px-2 py-0.5 rounded-lg">Admin</span>}
            </div>
          </div>

          {/* Members count */}
          <div>
            <p className="text-cafe-400 text-sm mb-1">Members</p>
            <p className="text-cafe-800">{room._count?.members || room.members?.length || 0}</p>
          </div>

          {/* Invite code for private rooms - ONLY visible to owner/admin */}
          {room.isPrivate && isOwner && room.code && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <p className="text-amber-800 text-sm font-medium">Invite Code (Admin Only)</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-white px-3 py-2 rounded-lg text-cafe-900 font-mono flex-1 text-center tracking-wider border border-amber-200">
                  {room.code}
                </code>
                <button
                  onClick={copyInviteCode}
                  className="bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-cafe-400 text-xs mt-2">Share this code with friends to invite them</p>
            </div>
          )}

          {/* Private room notice for non-owners */}
          {room.isPrivate && !isOwner && (
            <div className="bg-cafe-50 rounded-xl p-3 border border-cafe-200/50">
              <p className="text-cafe-500 text-sm">
                This is a private room. Only the admin can share the invite code.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-cafe-200 space-y-2">
            {/* Leave Room — available to everyone */}
            {!showConfirmLeave ? (
              <button
                onClick={() => setShowConfirmLeave(true)}
                className="w-full bg-cafe-50 hover:bg-cafe-100 text-cafe-700 border border-cafe-200 py-2.5 rounded-xl transition-colors"
              >
                Leave Room
              </button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-700 text-sm mb-3">
                  Are you sure you want to leave this room?
                </p>
                <input
                  type="text"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Reason for leaving (optional)"
                  className="w-full bg-white text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5 mb-3
                             border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowConfirmLeave(false); setLeaveReason(''); }}
                    className="flex-1 bg-white hover:bg-cafe-50 text-cafe-700 py-2 rounded-xl transition-colors border border-cafe-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLeave}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl transition-colors"
                  >
                    Leave
                  </button>
                </div>
              </div>
            )}

            {/* Delete Room — only for owner */}
            {isOwner && (
              <>
                {!showConfirmDelete ? (
                  <button
                    onClick={() => setShowConfirmDelete(true)}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-2.5 rounded-xl transition-colors"
                  >
                    Delete Room
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-700 text-sm mb-3">
                      Are you sure? This will delete all messages and remove all members.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowConfirmDelete(false)}
                        className="flex-1 bg-white hover:bg-cafe-50 text-cafe-700 py-2 rounded-xl transition-colors border border-cafe-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomInfo;
