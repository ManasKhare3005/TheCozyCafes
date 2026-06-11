import { useState, useEffect, useCallback } from 'react';
import socketService from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useFriends(token) {
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [onlineFriendIds, setOnlineFriendIds] = useState(new Set());
  const [friendMoods, setFriendMoods] = useState({}); // userId -> mood string
  const [friendStatuses, setFriendStatuses] = useState({}); // userId -> status string
  const [isLoading, setIsLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends);
      }
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    }
  }, [token]);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/friends/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIncomingRequests(data.incoming);
        setOutgoingRequests(data.outgoing);
      }
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchFriends(), fetchRequests()]);
      setIsLoading(false);
    };
    load();
  }, [fetchFriends, fetchRequests]);

  // Real-time updates
  useEffect(() => {
    const socket = socketService.connect(token);

    const handleRequestReceived = ({ friendship }) => {
      setIncomingRequests((prev) => {
        if (prev.some((r) => r.id === friendship.id)) return prev;
        return [friendship, ...prev];
      });
    };

    const handleRequestAccepted = ({ friendship }) => {
      setOutgoingRequests((prev) => prev.filter((r) => r.id !== friendship.id));
      const friend = friendship.addressee;
      setFriends((prev) => {
        if (prev.some((f) => f.friend.id === friend.id)) return prev;
        return [...prev, { friendshipId: friendship.id, friend }];
      });
    };

    const handleFriendRemoved = ({ friendshipId }) => {
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    };

    const handleFriendsOnlineList = ({ onlineUserIds }) => {
      setOnlineFriendIds(new Set(onlineUserIds));
    };

    const handleFriendOnline = ({ userId, mood, status }) => {
      setOnlineFriendIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
      if (mood) {
        setFriendMoods((prev) => ({ ...prev, [userId]: mood }));
      }
      if (status) {
        setFriendStatuses((prev) => ({ ...prev, [userId]: status }));
      }
    };

    const handleFriendOffline = ({ userId }) => {
      setOnlineFriendIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleFriendMoodUpdated = ({ userId, mood }) => {
      setFriendMoods((prev) => ({ ...prev, [userId]: mood }));
    };

    const handleFriendStatusUpdated = ({ userId, status }) => {
      setFriendStatuses((prev) => ({ ...prev, [userId]: status || undefined }));
    };

    // Track unread DMs in real-time
    const handleDMReceived = (message) => {
      if (message.sender?.id) {
        setFriends((prev) => prev.map((f) =>
          f.friend.id === message.sender.id
            ? { ...f, unreadCount: (f.unreadCount || 0) + 1 }
            : f
        ));
      }
    };

    socket.on('dm:received', handleDMReceived);
    socket.on('friend:request:received', handleRequestReceived);
    socket.on('friend:request:accepted', handleRequestAccepted);
    socket.on('friend:removed', handleFriendRemoved);
    socket.on('friends:online:list', handleFriendsOnlineList);
    socket.on('friend:online', handleFriendOnline);
    socket.on('friend:offline', handleFriendOffline);
    socket.on('friend:mood:updated', handleFriendMoodUpdated);
    socket.on('friend:status:updated', handleFriendStatusUpdated);

    return () => {
      socket.off('dm:received', handleDMReceived);
      socket.off('friend:request:received', handleRequestReceived);
      socket.off('friend:request:accepted', handleRequestAccepted);
      socket.off('friend:removed', handleFriendRemoved);
      socket.off('friends:online:list', handleFriendsOnlineList);
      socket.off('friend:online', handleFriendOnline);
      socket.off('friend:offline', handleFriendOffline);
      socket.off('friend:mood:updated', handleFriendMoodUpdated);
      socket.off('friend:status:updated', handleFriendStatusUpdated);
    };
  }, [token]);

  const sendRequest = useCallback(async (username) => {
    const res = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setOutgoingRequests((prev) => [data.friendship, ...prev]);
    return data.friendship;
  }, [token]);

  const respondToRequest = useCallback(async (friendshipId, action) => {
    const res = await fetch(`${API_URL}/friends/request/${friendshipId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setIncomingRequests((prev) => prev.filter((r) => r.id !== friendshipId));
    if (action === 'accept') {
      const friend = data.friendship.requester;
      setFriends((prev) => {
        if (prev.some((f) => f.friend.id === friend.id)) return prev;
        return [...prev, { friendshipId: data.friendship.id, friend }];
      });
    }
    return data.friendship;
  }, [token]);

  const removeFriend = useCallback(async (friendshipId) => {
    const res = await fetch(`${API_URL}/friends/${friendshipId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
  }, [token]);

  const searchUsers = useCallback(async (query) => {
    if (!query || query.length < 2) return [];
    const res = await fetch(`${API_URL}/friends/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.users;
  }, [token]);

  // Clear unread count for a friend (called when DM is opened)
  const markFriendRead = useCallback((friendId) => {
    setFriends((prev) => prev.map((f) =>
      f.friend.id === friendId ? { ...f, unreadCount: 0 } : f
    ));
  }, []);

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    onlineFriendIds,
    friendMoods,
    friendStatuses,
    isLoading,
    sendRequest,
    respondToRequest,
    removeFriend,
    searchUsers,
    markFriendRead,
    refreshFriends: fetchFriends,
  };
}
