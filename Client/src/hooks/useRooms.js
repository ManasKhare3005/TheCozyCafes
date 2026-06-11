import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socket';
import { track } from '../lib/analytics';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function useRooms(token, currentUserId) {
  const [rooms, setRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch user's rooms
  const fetchMyRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
      setError('Failed to load rooms');
    }
  }, [token]);

  // Fetch public rooms to discover
  const fetchPublicRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/public`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data.rooms);
      }
    } catch (err) {
      console.error('Failed to fetch public rooms:', err);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    const loadRooms = async () => {
      setIsLoading(true);
      await Promise.all([fetchMyRooms(), fetchPublicRooms()]);
      setIsLoading(false);
    };
    loadRooms();
  }, [fetchMyRooms, fetchPublicRooms]);

  // Listen for real-time room updates
  useEffect(() => {
    const handleRoomCreated = ({ room }) => {
      // If it's a public room and we're not the creator, add to public rooms
      if (!room.isPrivate && room.ownerId !== currentUserId) {
        setPublicRooms((prev) => {
          // Don't add duplicates
          if (prev.some(r => r.id === room.id)) return prev;
          return [room, ...prev];
        });
      }
    };

    const handleRoomDeleted = ({ roomId }) => {
      setPublicRooms((prev) => prev.filter(r => r.id !== roomId));
      setRooms((prev) => prev.filter(r => r.id !== roomId));
    };

    const handleRoomUpdated = ({ roomId, memberCount }) => {
      // Update member count in user's rooms
      setRooms((prev) => prev.map(r =>
        r.id === roomId ? { ...r, _count: { ...r._count, members: memberCount } } : r
      ));
      // Update member count in public rooms
      setPublicRooms((prev) => prev.map(r =>
        r.id === roomId ? { ...r, _count: { ...r._count, members: memberCount } } : r
      ));
    };

    // Increment unread count when a new message arrives in a room user is not viewing
    const handleNewRoomMessage = ({ roomId, senderId }) => {
      if (senderId === currentUserId) return;
      setRooms((prev) => prev.map(r =>
        r.id === roomId ? { ...r, unreadCount: (r.unreadCount || 0) + 1 } : r
      ));
    };

    // Ensure socket is connected (idempotent if already connected)
    const socket = socketService.connect(token);

    // Subscribe
    socket.on('room:new:message', handleNewRoomMessage);
    socket.on('room:created', handleRoomCreated);
    socket.on('room:deleted', handleRoomDeleted);
    socket.on('room:updated', handleRoomUpdated);

    return () => {
      socket.off('room:created', handleRoomCreated);
      socket.off('room:deleted', handleRoomDeleted);
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:new:message', handleNewRoomMessage);
    };
  }, [token, currentUserId]);

  // Create a new room
  const createRoom = useCallback(async (name, description, isPrivate, isAnonymous, options = {}) => {
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description, isPrivate, isAnonymous, ...options }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRooms((prev) => [{
        ...data.room,
        isAnonymousRoom: data.room.isAnonymous || false,
        userIsAnonymous: data.room.isAnonymous || false,
      }, ...prev]);
      track('room_created', {
        room_id: data.room.id,
        is_private: data.room.isPrivate,
        is_anonymous: data.room.isAnonymous,
        max_members: data.room.maxMembers,
        category: data.room.category || null,
      });
      return data.room;
    } catch (err) {
      throw err;
    }
  }, [token]);

  // Join a room
  const joinRoom = useCallback(async (roomId, code) => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRooms((prev) => [{
        ...data.room,
        isAnonymousRoom: data.room.isAnonymous || false,
        userIsAnonymous: data.room.isAnonymous || false,
      }, ...prev]);
      setPublicRooms((prev) => prev.filter((r) => r.id !== roomId));
      track('room_joined', {
        room_id: data.room.id,
        source: code ? 'invite_code' : 'public_room',
      });
      return data.room;
    } catch (err) {
      throw err;
    }
  }, [token]);

  // Join by invite code
  const joinByCode = useCallback(async (code) => {
    try {
      const res = await fetch(`${API_URL}/rooms/join-by-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRooms((prev) => [{
        ...data.room,
        isAnonymousRoom: data.room.isAnonymous || false,
        userIsAnonymous: data.room.isAnonymous || false,
      }, ...prev]);
      track('room_joined', {
        room_id: data.room.id,
        source: 'invite_code',
      });
      return data.room;
    } catch (err) {
      throw err;
    }
  }, [token]);

  // Leave a room
  const leaveRoom = useCallback(async (roomId) => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      await fetchPublicRooms(); // Refresh public rooms
    } catch (err) {
      throw err;
    }
  }, [token, fetchPublicRooms]);

  // Delete a room
  const deleteRoom = useCallback(async (roomId) => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      throw err;
    }
  }, [token]);

  // Toggle anonymous status for a room
  const toggleAnonymous = useCallback(async (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.isAnonymousRoom) return; // Can't toggle in anonymous rooms

    const newStatus = !room.userIsAnonymous;

    // Optimistic update
    setRooms((prev) => prev.map((r) =>
      r.id === roomId ? { ...r, userIsAnonymous: newStatus } : r
    ));

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/anonymous`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isAnonymous: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Revert on error
        setRooms((prev) => prev.map((r) =>
          r.id === roomId ? { ...r, userIsAnonymous: !newStatus } : r
        ));
        throw new Error(data.error);
      }

      return data.isAnonymous;
    } catch (err) {
      throw err;
    }
  }, [token, rooms]);

  // Clear unread count for a room (called when user opens the room)
  const markRoomRead = useCallback((roomId) => {
    setRooms((prev) => prev.map(r =>
      r.id === roomId ? { ...r, unreadCount: 0 } : r
    ));
  }, []);

  return {
    rooms,
    publicRooms,
    isLoading,
    error,
    createRoom,
    joinRoom,
    joinByCode,
    leaveRoom,
    deleteRoom,
    toggleAnonymous,
    markRoomRead,
    refreshRooms: fetchMyRooms,
  };
}
