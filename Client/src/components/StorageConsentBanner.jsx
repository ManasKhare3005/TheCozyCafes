import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'chatroom-storage-notice-accepted';

function StorageConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) !== 'true');
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-cafe-200 bg-white/95 px-4 py-3 shadow-warm-lg backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-cafe-700">
          Chat Room Cafe uses local/session storage for sign-in, preferences, and safety features. Review the{' '}
          <a className="font-medium underline hover:text-cafe-900" href="/legal/cookies.html" target="_blank" rel="noreferrer">
            storage notice
          </a>{' '}
          and{' '}
          <a className="font-medium underline hover:text-cafe-900" href="/legal/privacy.html" target="_blank" rel="noreferrer">
            privacy policy
          </a>.
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-lg bg-cafe-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cafe-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default StorageConsentBanner;
