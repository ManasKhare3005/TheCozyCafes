import React from 'react';

function TypingIndicator({ typingUsers }) {
  if (typingUsers.length === 0) return null;

  let text;
  if (typingUsers.length === 1) {
    text = `${typingUsers[0].username} is typing`;
  } else if (typingUsers.length === 2) {
    text = `${typingUsers[0].username} and ${typingUsers[1].username} are typing`;
  } else {
    text = 'Several people are typing';
  }

  return (
    <div className="shrink-0 px-4 py-2 text-sm text-cafe-400 flex items-center gap-2 bg-white/50">
      <span>{text}</span>
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-cafe-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-cafe-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-cafe-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

export default TypingIndicator;
