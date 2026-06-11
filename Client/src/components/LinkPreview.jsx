import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Client-side cache to avoid re-fetching the same URL
const previewCache = new Map();

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

export function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate and limit to 3 previews per message
  return [...new Set(matches)].slice(0, 3);
}

function LinkPreviewCard({ url, isOwnMessage }) {
  const { token } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchPreview = async () => {
      // Check client cache first
      if (previewCache.has(url)) {
        const cached = previewCache.get(url);
        if (cached) setPreview(cached);
        else setError(true);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/link-preview?url=${encodeURIComponent(url)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;

        if (data.title || data.description || data.image) {
          previewCache.set(url, data);
          setPreview(data);
        } else {
          previewCache.set(url, null);
          setError(true);
        }
      } catch {
        if (!cancelled) {
          previewCache.set(url, null);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreview();
    return () => { cancelled = true; };
  }, [url, token]);

  if (loading) {
    return (
      <div className={`mt-2 rounded-xl border p-3 animate-pulse ${
        isOwnMessage ? 'border-white/20 bg-white/10' : 'border-cafe-200 bg-cafe-50'
      }`}>
        <div className={`h-3 rounded w-3/4 mb-2 ${isOwnMessage ? 'bg-white/20' : 'bg-cafe-200'}`} />
        <div className={`h-2 rounded w-full ${isOwnMessage ? 'bg-white/15' : 'bg-cafe-150'}`} />
      </div>
    );
  }

  if (error || !preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 block rounded-xl border overflow-hidden transition-colors group/link ${
        isOwnMessage
          ? 'border-white/20 bg-white/10 hover:bg-white/15'
          : 'border-cafe-200 bg-cafe-50 hover:bg-cafe-100'
      }`}
    >
      <div className="flex">
        {/* Image */}
        {preview.image && (
          <div className="w-24 h-24 shrink-0">
            <img
              src={preview.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}

        {/* Text content */}
        <div className="flex-1 min-w-0 p-3">
          {preview.siteName && (
            <p className={`text-[10px] font-medium uppercase tracking-wide mb-0.5 ${
              isOwnMessage ? 'text-cafe-300' : 'text-cafe-400'
            }`}>
              {preview.siteName}
            </p>
          )}
          {preview.title && (
            <p className={`text-sm font-medium leading-snug line-clamp-2 ${
              isOwnMessage ? 'text-white' : 'text-cafe-800'
            }`}>
              {preview.title}
            </p>
          )}
          {preview.description && (
            <p className={`text-xs leading-relaxed mt-1 line-clamp-2 ${
              isOwnMessage ? 'text-cafe-200/80' : 'text-cafe-500'
            }`}>
              {preview.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

export default function LinkPreview({ text, isOwnMessage }) {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {urls.map((url) => (
        <LinkPreviewCard key={url} url={url} isOwnMessage={isOwnMessage} />
      ))}
    </div>
  );
}
