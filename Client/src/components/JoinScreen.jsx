import React, { useState } from 'react';

function JoinScreen({ onJoin }) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onJoin(username.trim());
    }
  };

  return (
    <div className="min-h-screen bg-cafe-50 cafe-texture flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-warm-lg p-8 w-full max-w-md border border-cafe-200/50">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-cafe-700 to-cafe-900 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-warm rotate-3 hover:rotate-0 transition-transform duration-300">
            <svg className="w-10 h-10 text-cafe-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-serif font-bold text-cafe-900">Welcome to Chatroom</h1>
          <p className="text-cafe-500 mt-2 text-sm">Enter your name to join the conversation</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-cafe-700 mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name..."
              className="w-full bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-3
                         border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 transition-colors"
              autoFocus
              maxLength={20}
            />
          </div>
          <button
            type="submit"
            disabled={!username.trim()}
            className="w-full bg-cafe-700 hover:bg-cafe-800 disabled:bg-cafe-300
                       disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl
                       transition-all duration-200 shadow-warm hover:shadow-warm-lg"
          >
            Join Chat
          </button>
        </form>

        <p className="text-center text-cafe-400 text-sm mt-6">
          Be respectful and have fun!
        </p>
      </div>
    </div>
  );
}

export default JoinScreen;
