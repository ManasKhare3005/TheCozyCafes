import { useState, useEffect } from 'react';

const brewingMessages = [
  "Brewing your experience...",
  "Grinding the beans...",
  "Steaming the milk...",
  "Pouring a fresh cup...",
  "Warming up the café...",
  "Setting your table...",
];

export default function CafeLoader({ message, size = "default" }) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (message) return;
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % brewingMessages.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [message]);

  const displayMsg = message || brewingMessages[msgIndex];

  if (size === "small") {
    return (
      <div className="flex items-center gap-2 text-cafe-500">
        <div className="coffee-cup-small">
          <div className="cup-body-sm" />
          <div className="steam-container-sm">
            <div className="steam-sm steam-sm-1" />
            <div className="steam-sm steam-sm-2" />
            <div className="steam-sm steam-sm-3" />
          </div>
        </div>
        <span className="font-serif text-sm animate-pulse">{displayMsg}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cafe-50 cafe-texture flex items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        {/* Coffee cup with steam animation */}
        <div className="coffee-cup-loader">
          <div className="saucer" />
          <div className="cup-body">
            <div className="coffee-fill" />
            <div className="cup-shine" />
          </div>
          <div className="cup-handle" />
          <div className="steam-container">
            <div className="steam steam-1" />
            <div className="steam steam-2" />
            <div className="steam steam-3" />
          </div>
        </div>

        {/* Loading text */}
        <div className="text-center">
          <p className="font-serif text-xl text-cafe-700 transition-all duration-500">
            {displayMsg}
          </p>
          <div className="flex justify-center gap-1.5 mt-3">
            <span className="bean bean-1">●</span>
            <span className="bean bean-2">●</span>
            <span className="bean bean-3">●</span>
          </div>
        </div>
      </div>
    </div>
  );
}
