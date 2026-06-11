import React from 'react';

function OnboardingModal({ onClose, onCreateRoom, onBrowseRooms, onInviteFriend, onEmptyChair }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-cafe-900/50 p-4 modal-backdrop">
      <div className="w-full max-w-lg rounded-2xl border border-cafe-200 bg-white p-6 shadow-warm-lg">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-cafe-400">Welcome</p>
          <h2 className="font-serif text-2xl font-bold text-cafe-900">Pull up a chair</h2>
          <p className="mt-2 text-sm leading-relaxed text-cafe-500">
            Start with one simple move. You can join a public table, make your own quiet corner, or try a short stranger chat.
          </p>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={onBrowseRooms}
            className="rounded-xl border border-cafe-200 bg-cafe-50 px-4 py-3 text-left hover:bg-cafe-100"
          >
            <span className="block font-medium text-cafe-900">Join a public table</span>
            <span className="text-sm text-cafe-500">Find an active room and send your first message.</span>
          </button>
          <button
            type="button"
            onClick={onCreateRoom}
            className="rounded-xl border border-cafe-200 bg-cafe-50 px-4 py-3 text-left hover:bg-cafe-100"
          >
            <span className="block font-medium text-cafe-900">Create your own table</span>
            <span className="text-sm text-cafe-500">Pick a topic, then copy your invite link for a friend.</span>
          </button>
          <button
            type="button"
            onClick={onInviteFriend}
            className="rounded-xl border border-cafe-200 bg-cafe-50 px-4 py-3 text-left hover:bg-cafe-100"
          >
            <span className="block font-medium text-cafe-900">Invite a friend</span>
            <span className="text-sm text-cafe-500">Share your referral link from the account menu.</span>
          </button>
          <button
            type="button"
            onClick={onEmptyChair}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100"
          >
            <span className="block font-medium text-amber-900">Try Empty Chair</span>
            <span className="text-sm text-amber-700">A low-pressure five-minute chat with someone new.</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-cafe-800 px-4 py-3 text-sm font-medium text-white hover:bg-cafe-900"
        >
          Start exploring
        </button>
      </div>
    </div>
  );
}

export default OnboardingModal;
