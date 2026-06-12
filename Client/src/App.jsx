import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRooms } from './hooks/useRooms';
import socketService from './services/socket';
import AuthScreen from './components/AuthScreen';
import RoomLobby from './components/RoomLobby';
import CafeLoader from './components/CafeLoader';
import OnboardingModal from './components/OnboardingModal';
import { useFriends } from './hooks/useFriends';
import { useNotifications } from './hooks/useNotifications';
import StorageConsentBanner from './components/StorageConsentBanner';
import { track } from './lib/analytics';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ChatRoom = React.lazy(() => import('./components/ChatRoom'));
const RoomInfo = React.lazy(() => import('./components/RoomInfo'));
const BaristaChat = React.lazy(() => import('./components/BaristaChat'));
const DMChat = React.lazy(() => import('./components/DMChat'));
const ProfileModal = React.lazy(() => import('./components/ProfileModal'));
const StickyBoard = React.lazy(() => import('./components/StickyBoard'));
const LostAndFound = React.lazy(() => import('./components/LostAndFound'));
const EmptyChair = React.lazy(() => import('./components/EmptyChair'));
const AdminModerationPanel = React.lazy(() => import('./components/AdminModerationPanel'));
const BlockedUsersPanel = React.lazy(() => import('./components/BlockedUsersPanel'));

function MainApp() {
  const { user, token, logout } = useAuth();
  useEffect(() => {
    track('app_loaded');
  }, []);
  const {
    rooms,
    publicRooms,
    isLoading,
    createRoom,
    joinRoom,
    joinByCode,
    leaveRoom,
    deleteRoom,
    toggleAnonymous,
    markRoomRead,
    refreshRooms,
  } = useRooms(token, user?.id);

  const {
    friends,
    incomingRequests,
    outgoingRequests,
    onlineFriendIds,
    friendMoods,
    sendRequest,
    respondToRequest,
    removeFriend,
    searchUsers,
    markFriendRead,
    friendStatuses,
  } = useFriends(token);

  const {
    notifications,
    unreadCount: notifUnreadCount,
    markAllRead: markAllNotifsRead,
    markRead: markNotifRead,
  } = useNotifications(token);

  const [currentRoom, setCurrentRoom] = useState(null);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [dmFriend, setDmFriend] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null); // userId to view
  const [showStickyBoard, setShowStickyBoard] = useState(false);
  const [showLostFound, setShowLostFound] = useState(false);
  const [showEmptyChair, setShowEmptyChair] = useState(false);
  const [showAdminModeration, setShowAdminModeration] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !user?.onboardingCompletedAt);
  const baristaRef = useRef(null);

  const completeOnboarding = useCallback(async (nextAction) => {
    setShowOnboarding(false);
    try {
      await fetch(`${API_URL}/auth/onboarding/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    }
    if (nextAction === 'emptychair') setShowEmptyChair(true);
  }, [token]);

  // Mood management
  const handleSetMood = useCallback(async (mood) => {
    try {
      await fetch(`${API_URL}/users/mood`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mood }),
      });
      socketService.updateMood(mood);
    } catch (err) {
      console.error('Failed to set mood:', err);
    }
  }, [token]);

  // Status management
  const handleSetStatus = useCallback(async (status) => {
    try {
      await fetch(`${API_URL}/users/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      socketService.updateStatus(status);
    } catch (err) {
      console.error('Failed to set status:', err);
    }
  }, [token]);

  // Keep currentRoom in sync with rooms list (for anonymous status updates)
  useEffect(() => {
    if (currentRoom) {
      const updatedRoom = rooms.find(r => r.id === currentRoom.id);
      if (updatedRoom && updatedRoom.userIsAnonymous !== currentRoom.userIsAnonymous) {
        setCurrentRoom(updatedRoom);
      }
    }
  }, [rooms, currentRoom]);

  // ─── Browser back button support ───
  const goToLobby = useCallback(() => {
    setCurrentRoom(null);
    setShowRoomInfo(false);
    setDmFriend(null);
    setShowStickyBoard(false);
    setShowLostFound(false);
    setShowEmptyChair(false);
    setShowAdminModeration(false);
    setShowBlockedUsers(false);
    setShowProfile(false);
    setViewingProfile(null);
  }, []);

  // Determine if we're on a sub-view (not lobby)
  const isOnSubView = !!(currentRoom || dmFriend || showStickyBoard || showLostFound || showEmptyChair || showAdminModeration || showBlockedUsers);

  // Push a history entry when entering a sub-view
  useEffect(() => {
    if (isOnSubView) {
      window.history.pushState({ view: 'subview' }, '');
    }
  }, [isOnSubView]);

  // Listen for browser back button
  useEffect(() => {
    const handlePopState = () => {
      goToLobby();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [goToLobby]);

  const handleSelectRoom = (room) => {
    setCurrentRoom(room);
    setShowRoomInfo(false);
    markRoomRead(room.id);
  };

  const handleBackToLobby = () => {
    setCurrentRoom(null);
    setShowRoomInfo(false);
  };

  const handleLeaveRoom = async (roomId, reason) => {
    socketService.leaveRoom(reason);
    await leaveRoom(roomId);
    if (currentRoom?.id === roomId) {
      setCurrentRoom(null);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    await deleteRoom(roomId);
    if (currentRoom?.id === roomId) {
      setCurrentRoom(null);
    }
  };

  const handleToggleAnonymous = async (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (room?.isAnonymousRoom) return;
    await toggleAnonymous(roomId);
  };

  // Show DM view when a friend is selected for messaging
  if (dmFriend) {
    return (
      <>
        <div className="flex h-screen overflow-hidden bg-cafe-50 cafe-texture">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <DMChat
              friend={dmFriend}
              onBack={() => setDmFriend(null)}
              isOnline={onlineFriendIds.has(dmFriend.id)}
              friendMood={friendMoods[dmFriend.id]}
            />
          </div>
        </div>
        <BaristaChat ref={baristaRef} />
      </>
    );
  }

  // Show chat view when a room is selected
  if (currentRoom) {
    return (
      <>
        <div className="flex h-screen overflow-hidden bg-cafe-50 cafe-texture">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <ChatRoom
              room={currentRoom}
              onShowRoomInfo={() => setShowRoomInfo(true)}
              onLogout={logout}
              onBack={handleBackToLobby}
              onKicked={(roomId) => {
                setCurrentRoom(null);
                refreshRooms();
              }}
            />
          </div>

          {showRoomInfo && (
            <RoomInfo
              room={currentRoom}
              onClose={() => setShowRoomInfo(false)}
              onLeave={handleLeaveRoom}
              onDelete={handleDeleteRoom}
              currentUserId={user.id}
            />
          )}
        </div>
        <BaristaChat ref={baristaRef} />
      </>
    );
  }

  // Show sticky board
  if (showStickyBoard) {
    return (
      <>
        <StickyBoard onClose={() => setShowStickyBoard(false)} friends={friends} />
        <BaristaChat ref={baristaRef} />
      </>
    );
  }

  // Show lost & found
  if (showLostFound) {
    return (
      <>
        <LostAndFound onClose={() => setShowLostFound(false)} />
        <BaristaChat ref={baristaRef} />
      </>
    );
  }

  // Show empty chair
  if (showEmptyChair) {
    return (
      <>
        <EmptyChair onClose={() => setShowEmptyChair(false)} />
        <BaristaChat ref={baristaRef} />
      </>
    );
  }

  if (showAdminModeration && user?.role === 'admin') {
    return (
      <React.Suspense fallback={<CafeLoader message="Loading moderation queue..." />}>
        <AdminModerationPanel
          token={token}
          onClose={() => setShowAdminModeration(false)}
        />
      </React.Suspense>
    );
  }

  if (showBlockedUsers) {
    return (
      <React.Suspense fallback={<CafeLoader message="Loading blocked users..." />}>
        <BlockedUsersPanel
          token={token}
          onClose={() => setShowBlockedUsers(false)}
        />
      </React.Suspense>
    );
  }

  // Show lobby when no room is selected
  return (
    <>
      <RoomLobby
        rooms={rooms}
        publicRooms={publicRooms}
        onSelectRoom={handleSelectRoom}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onJoinByCode={joinByCode}
        onLeaveRoom={handleLeaveRoom}
        onToggleAnonymous={handleToggleAnonymous}
        onLogout={logout}
        currentUserId={user.id}
        username={user.username}
        discriminator={user.discriminator}
        referralCode={user.referralCode}
        isLoading={isLoading}
        onOpenBarista={() => baristaRef.current?.open()}
        onOpenBoard={() => setShowStickyBoard(true)}
        onOpenLostFound={() => setShowLostFound(true)}
        onOpenEmptyChair={() => setShowEmptyChair(true)}
        friends={friends}
        incomingRequests={incomingRequests}
        outgoingRequests={outgoingRequests}
        onlineFriendIds={onlineFriendIds}
        friendMoods={friendMoods}
        friendStatuses={friendStatuses}
        currentMood={user.mood}
        currentStatus={user.status}
        onSetMood={handleSetMood}
        onSetStatus={handleSetStatus}
        onOpenProfile={() => setShowProfile(true)}
        onOpenBlocks={() => setShowBlockedUsers(true)}
        isAdmin={user.role === 'admin'}
        onOpenAdmin={() => setShowAdminModeration(true)}
        onSelectFriend={(friend) => { setDmFriend(friend); markFriendRead(friend.id); }}
        onSendFriendRequest={sendRequest}
        onRespondToRequest={respondToRequest}
        onRemoveFriend={removeFriend}
        onSearchUsers={searchUsers}
        notifications={notifications}
        notifUnreadCount={notifUnreadCount}
        onMarkAllNotifsRead={markAllNotifsRead}
        onMarkNotifRead={markNotifRead}
      />
      <BaristaChat ref={baristaRef} />
      {showProfile && (
        <ProfileModal
          userId={user.id}
          token={token}
          onClose={() => setShowProfile(false)}
          isOwnProfile={true}
          onAccountDeleted={() => {
            setShowProfile(false);
            logout();
          }}
        />
      )}
      {viewingProfile && (
        <ProfileModal
          userId={viewingProfile}
          token={token}
          onClose={() => setViewingProfile(null)}
          isOwnProfile={false}
        />
      )}
      {showOnboarding && (
        <OnboardingModal
          onClose={() => completeOnboarding()}
          onBrowseRooms={() => completeOnboarding()}
          onCreateRoom={() => completeOnboarding()}
          onInviteFriend={() => completeOnboarding()}
          onEmptyChair={() => completeOnboarding('emptychair')}
        />
      )}
    </>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <CafeLoader />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <MainApp />;
}

function App() {
  return (
    <AuthProvider>
      <React.Suspense fallback={<CafeLoader />}>
        <AppContent />
      </React.Suspense>
      <StorageConsentBanner />
    </AuthProvider>
  );
}

export default App;
