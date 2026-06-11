import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TAGS = [
  { value: 'question', label: 'Question', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'looking-for', label: 'Looking For', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'recommendation', label: 'Recommendation', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'help', label: 'Help', color: 'bg-orange-100 text-orange-700 border-orange-200' },
];

function TagBadge({ tag, small }) {
  const tagInfo = TAGS.find((t) => t.value === tag) || TAGS[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${tagInfo.color} ${small ? 'text-[9px]' : ''}`}>
      {tagInfo.label}
    </span>
  );
}

function PostCard({ post, isSelected, onClick, currentUserId }) {
  const isOwn = post.authorId === currentUserId || post.author?.id === currentUserId;
  const timeAgo = getTimeAgo(post.createdAt);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? 'bg-cafe-100 border-cafe-400 shadow-sm'
          : 'bg-white border-cafe-200/50 hover:border-cafe-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <TagBadge tag={post.tag} />
        {post.status === 'resolved' && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 text-[10px] font-medium">
            Resolved
          </span>
        )}
      </div>
      <h4 className="font-medium text-cafe-900 text-sm leading-snug mb-1">{post.title}</h4>
      <p className="text-xs text-cafe-500 line-clamp-2 mb-2">{post.body}</p>
      <div className="flex items-center justify-between text-[10px] text-cafe-400">
        <span>{isOwn ? 'You' : post.author?.username || 'Unknown'}</span>
        <div className="flex items-center gap-2">
          <span>{post._count?.replies || 0} replies</span>
          <span>{timeAgo}</span>
        </div>
      </div>
    </button>
  );
}

function ReplyItem({ reply, currentUserId }) {
  const isOwn = reply.author?.id === currentUserId;
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cafe-300 to-cafe-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
        {(reply.author?.username || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-cafe-700">
            {isOwn ? 'You' : reply.author?.username || 'Unknown'}
          </span>
          <span className="text-[10px] text-cafe-400">{getTimeAgo(reply.createdAt)}</span>
        </div>
        <p className="text-sm text-cafe-800 leading-relaxed">{reply.text}</p>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function LostAndFound({ onClose }) {
  const { token, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [activeTag, setActiveTag] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const repliesEndRef = useRef(null);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTag, setNewTag] = useState('question');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeTag) params.set('tag', activeTag);
      const res = await fetch(`${API_URL}/lostfound?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  }, [token, activeTag]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Fetch replies when a post is selected
  useEffect(() => {
    if (!selectedPost) return;
    setLoadingReplies(true);
    fetch(`${API_URL}/lostfound/${selectedPost.id}/replies`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setReplies(data.replies || []))
      .catch(() => {})
      .finally(() => setLoadingReplies(false));
  }, [selectedPost?.id, token]);

  // Scroll replies to bottom
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  // Socket listeners
  useEffect(() => {
    const handleNew = (post) => setPosts((prev) => [post, ...prev]);
    const handleReply = ({ postId, reply }) => {
      if (selectedPost?.id === postId) {
        setReplies((prev) => [...prev, reply]);
      }
      setPosts((prev) => prev.map((p) =>
        p.id === postId ? { ...p, _count: { ...p._count, replies: (p._count?.replies || 0) + 1 } } : p
      ));
    };
    const handleResolved = ({ postId }) => {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, status: 'resolved' } : p));
      if (selectedPost?.id === postId) {
        setSelectedPost((prev) => prev ? { ...prev, status: 'resolved' } : prev);
      }
    };

    socketService.onLostFoundNew(handleNew);
    socketService.onLostFoundReply(handleReply);
    socketService.onLostFoundResolved(handleResolved);
    return () => {
      socketService.offLostFoundNew(handleNew);
      socketService.offLostFoundReply(handleReply);
      socketService.offLostFoundResolved(handleResolved);
    };
  }, [selectedPost?.id]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!newTitle.trim() || !newBody.trim()) {
      setCreateError('Title and body are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/lostfound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle, body: newBody, tag: newTag }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setShowCreate(false);
      setNewTitle('');
      setNewBody('');
      setNewTag('question');
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedPost) return;
    setSending(true);
    try {
      await fetch(`${API_URL}/lostfound/${selectedPost.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: replyText }),
      });
      setReplyText('');
    } catch (err) {
      console.error('Failed to reply:', err);
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedPost) return;
    try {
      await fetch(`${API_URL}/lostfound/${selectedPost.id}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Lost & Found</h3>
            <span className="text-xs text-cafe-400 ml-2">Community Q&A</span>
          </div>
          <div className="flex items-center gap-2">
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-sm px-3 py-1.5 rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 transition-colors"
              >
                + New Post
              </button>
            )}
            <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tag filters */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-cafe-200/50">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !activeTag ? 'bg-cafe-700 text-white' : 'bg-cafe-100 text-cafe-600 hover:bg-cafe-200'
            }`}
          >
            All
          </button>
          {TAGS.map((tag) => (
            <button
              key={tag.value}
              onClick={() => setActiveTag(activeTag === tag.value ? null : tag.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeTag === tag.value ? tag.color + ' ring-2 ring-offset-1 ring-cafe-300' : tag.color + ' opacity-70 hover:opacity-100'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Post list */}
          <div className="w-2/5 border-r border-cafe-200/50 overflow-y-auto p-3 space-y-2">
            {showCreate && (
              <form onSubmit={handleCreate} className="bg-cafe-50 rounded-xl p-3 space-y-2 border border-cafe-200/50 mb-2">
                <h4 className="text-xs font-bold text-cafe-700">New Post</h4>
                {createError && <p className="text-red-600 text-xs">{createError}</p>}
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title (what are you looking for?)"
                  maxLength={100}
                  className="w-full bg-white text-cafe-900 placeholder-cafe-400 rounded-lg px-3 py-2 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
                />
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="More details..."
                  maxLength={1000}
                  rows={3}
                  className="w-full bg-white text-cafe-900 placeholder-cafe-400 rounded-lg px-3 py-2 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm resize-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((tag) => (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => setNewTag(tag.value)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                        newTag === tag.value ? tag.color + ' ring-2 ring-offset-1 ring-cafe-300' : 'bg-cafe-50 text-cafe-500 border-cafe-200 hover:bg-cafe-100'
                      }`}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 text-sm py-1.5 rounded-lg bg-cafe-100 text-cafe-600 hover:bg-cafe-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newTitle.trim() || !newBody.trim()}
                    className="flex-1 text-sm py-1.5 rounded-lg bg-cafe-700 text-white hover:bg-cafe-800 disabled:bg-cafe-300 transition-colors"
                  >
                    {creating ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </form>
            )}
            {posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-cafe-400 py-12">
                <span className="text-4xl mb-3">🔍</span>
                <p className="font-serif text-base text-cafe-500">Nothing here yet</p>
                <p className="text-xs mt-1">Be the first to post!</p>
              </div>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isSelected={selectedPost?.id === post.id}
                  onClick={() => setSelectedPost(post)}
                  currentUserId={user.id}
                />
              ))
            )}
          </div>

          {/* Right: Thread view */}
          <div className="flex-1 flex flex-col">
            {selectedPost ? (
              <>
                {/* Post detail header */}
                <div className="p-4 border-b border-cafe-200/50">
                  <div className="flex items-start gap-2 mb-2">
                    <TagBadge tag={selectedPost.tag} />
                    {selectedPost.status === 'resolved' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 text-[10px] font-medium">
                        Resolved
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif font-bold text-cafe-900 text-base mb-1">{selectedPost.title}</h3>
                  <p className="text-sm text-cafe-700 leading-relaxed mb-2">{selectedPost.body}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cafe-400">
                      Posted by {selectedPost.author?.id === user.id ? 'you' : selectedPost.author?.username} {getTimeAgo(selectedPost.createdAt)}
                    </span>
                    {selectedPost.author?.id === user.id && selectedPost.status === 'open' && (
                      <button
                        onClick={handleResolve}
                        className="text-xs px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>

                {/* Replies */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingReplies ? (
                    <p className="text-center text-cafe-400 text-sm py-4">Loading replies...</p>
                  ) : replies.length === 0 ? (
                    <p className="text-center text-cafe-400 text-sm py-4">No replies yet. Be the first!</p>
                  ) : (
                    replies.map((reply) => (
                      <ReplyItem key={reply.id} reply={reply} currentUserId={user.id} />
                    ))
                  )}
                  <div ref={repliesEndRef} />
                </div>

                {/* Reply input */}
                {selectedPost.status === 'open' && (
                  <form onSubmit={handleReply} className="p-3 border-t border-cafe-200/50 flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a reply..."
                      maxLength={500}
                      className="flex-1 bg-cafe-50 text-cafe-900 placeholder-cafe-400 rounded-xl px-4 py-2.5
                                 border border-cafe-200 focus:outline-none focus:ring-2 focus:ring-cafe-300 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!replyText.trim() || sending}
                      className="px-4 py-2.5 bg-cafe-700 text-white rounded-xl hover:bg-cafe-800 disabled:bg-cafe-300 transition-colors text-sm"
                    >
                      Reply
                    </button>
                  </form>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-cafe-400">
                <div className="text-center">
                  <span className="text-3xl block mb-2">👈</span>
                  <p className="text-sm">Select a post to view replies</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LostAndFound;
