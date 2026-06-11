import React from 'react';

function OnlineUsers({ users, currentUserId }) {
  return (
    <div className="w-64 bg-white border-l border-cafe-200/50 p-4 hidden md:block">
      <h3 className="text-cafe-500 text-xs font-semibold uppercase tracking-wider mb-4">
        Online — {users.length}
      </h3>
      <ul className="space-y-2">
        {users.map((user) => (
          <li key={user.id} className="flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 bg-cafe-200 rounded-full flex items-center justify-center text-sm font-medium text-cafe-700">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
            </div>
            <span className="text-cafe-700 text-sm truncate">
              {user.username}
              {user.id === currentUserId && (
                <span className="text-cafe-400 ml-1">(you)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default OnlineUsers;
