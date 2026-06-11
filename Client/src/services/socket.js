import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

class SocketService {
  socket = null;

  connect(token) {
    if (this.socket) return this.socket;

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Room actions
  joinRoom(roomId) {
    this.socket?.emit('room:join', roomId);
  }

  leaveRoom(reason) {
    this.socket?.emit('room:leave', reason ? { reason } : undefined);
  }

  // Send a message (with optional media and reply)
  sendMessage(text, media, replyTo) {
    this.socket?.emit('message:send', {
      text,
      ...(media && { mediaUrl: media.url, mediaType: media.mediaType, mediaName: media.mediaName }),
      ...(replyTo && { replyToId: replyTo.id, replyTo: { id: replyTo.id, text: replyTo.text, sender: replyTo.sender, mediaType: replyTo.mediaType } }),
    });
  }

  // Emit typing status
  setTyping(isTyping) {
    this.socket?.emit('user:typing', isTyping);
  }

  // Toggle incognito mode
  setIncognito(enabled) {
    this.socket?.emit('user:incognito', enabled);
  }

  // Toggle anonymous mode
  setAnonymous(enabled) {
    this.socket?.emit('user:anonymous', enabled);
  }

  // Subscribe to events
  onRoomJoined(callback) {
    this.socket?.on('room:joined', callback);
  }

  onRoomUsersUpdated(callback) {
    this.socket?.on('room:users:updated', callback);
  }

  onMessage(callback) {
    this.socket?.on('message:received', callback);
  }

  onUserJoined(callback) {
    this.socket?.on('user:joined', callback);
  }

  onUserLeft(callback) {
    this.socket?.on('user:left', callback);
  }

  onUserTyping(callback) {
    this.socket?.on('user:typing', callback);
  }

  onIncognitoUpdated(callback) {
    this.socket?.on('user:incognito:updated', callback);
  }

  onAnonymousUpdated(callback) {
    this.socket?.on('user:anonymous:updated', callback);
  }

  onError(callback) {
    this.socket?.on('error', callback);
  }

  // Kick events
  onKicked(callback) {
    this.socket?.on('user:kicked', callback);
  }

  onKickVoteUpdated(callback) {
    this.socket?.on('kick:vote:updated', callback);
  }

  onIdentityRevealed(callback) {
    this.socket?.on('user:identity:revealed', callback);
  }

  // Unsubscribe from events
  offRoomJoined(callback) {
    this.socket?.off('room:joined', callback);
  }

  offRoomUsersUpdated(callback) {
    this.socket?.off('room:users:updated', callback);
  }

  offMessage(callback) {
    this.socket?.off('message:received', callback);
  }

  offUserJoined(callback) {
    this.socket?.off('user:joined', callback);
  }

  offUserLeft(callback) {
    this.socket?.off('user:left', callback);
  }

  offUserTyping(callback) {
    this.socket?.off('user:typing', callback);
  }

  offIncognitoUpdated(callback) {
    this.socket?.off('user:incognito:updated', callback);
  }

  offAnonymousUpdated(callback) {
    this.socket?.off('user:anonymous:updated', callback);
  }

  offError(callback) {
    this.socket?.off('error', callback);
  }

  offKicked(callback) {
    this.socket?.off('user:kicked', callback);
  }

  offKickVoteUpdated(callback) {
    this.socket?.off('kick:vote:updated', callback);
  }

  offIdentityRevealed(callback) {
    this.socket?.off('user:identity:revealed', callback);
  }

  // DM actions
  sendDM(receiverId, text, media, replyTo) {
    this.socket?.emit('dm:send', {
      receiverId,
      text,
      ...(media && { mediaUrl: media.url, mediaType: media.mediaType, mediaName: media.mediaName }),
      ...(replyTo && { replyToId: replyTo.id, replyTo: { id: replyTo.id, text: replyTo.text, sender: replyTo.sender, mediaType: replyTo.mediaType } }),
    });
  }

  setDMTyping(receiverId, isTyping) {
    this.socket?.emit('dm:typing', { receiverId, isTyping });
  }

  markDMRead(conversationId, senderId) {
    this.socket?.emit('dm:read', { conversationId, senderId });
  }

  // DM event subscriptions
  onDMReceived(cb) { this.socket?.on('dm:received', cb); }
  offDMReceived(cb) { this.socket?.off('dm:received', cb); }

  onDMTyping(cb) { this.socket?.on('dm:typing', cb); }
  offDMTyping(cb) { this.socket?.off('dm:typing', cb); }

  onDMRead(cb) { this.socket?.on('dm:read', cb); }
  offDMRead(cb) { this.socket?.off('dm:read', cb); }

  // Friend event subscriptions
  onFriendRequestReceived(cb) { this.socket?.on('friend:request:received', cb); }
  offFriendRequestReceived(cb) { this.socket?.off('friend:request:received', cb); }

  onFriendRequestAccepted(cb) { this.socket?.on('friend:request:accepted', cb); }
  offFriendRequestAccepted(cb) { this.socket?.off('friend:request:accepted', cb); }

  onFriendRemoved(cb) { this.socket?.on('friend:removed', cb); }
  offFriendRemoved(cb) { this.socket?.off('friend:removed', cb); }

  // ─── Room Voice Chat ───
  joinVoice() { this.socket?.emit('voice:join'); }
  leaveVoice() { this.socket?.emit('voice:leave'); }
  voiceSignal(targetSocketId, type, data) {
    this.socket?.emit('voice:signal', { targetSocketId, type, data });
  }
  voiceToggleMute(isMuted) { this.socket?.emit('voice:toggle-mute', { isMuted }); }

  onVoiceJoined(cb) { this.socket?.on('voice:joined', cb); }
  offVoiceJoined(cb) { this.socket?.off('voice:joined', cb); }
  onVoiceUserJoined(cb) { this.socket?.on('voice:user-joined', cb); }
  offVoiceUserJoined(cb) { this.socket?.off('voice:user-joined', cb); }
  onVoiceUserLeft(cb) { this.socket?.on('voice:user-left', cb); }
  offVoiceUserLeft(cb) { this.socket?.off('voice:user-left', cb); }
  onVoiceUsersUpdated(cb) { this.socket?.on('voice:users-updated', cb); }
  offVoiceUsersUpdated(cb) { this.socket?.off('voice:users-updated', cb); }
  onVoiceSignal(cb) { this.socket?.on('voice:signal', cb); }
  offVoiceSignal(cb) { this.socket?.off('voice:signal', cb); }

  // ─── DM Calls ───
  dmCallInitiate(receiverId, callType) {
    this.socket?.emit('dm:call:initiate', { receiverId, callType });
  }
  dmCallAccept(callerId) { this.socket?.emit('dm:call:accept', { callerId }); }
  dmCallReject(callerId) { this.socket?.emit('dm:call:reject', { callerId }); }
  dmCallEnd(targetUserId) { this.socket?.emit('dm:call:end', { targetUserId }); }
  dmCallSignal(targetUserId, type, data) {
    this.socket?.emit('dm:call:signal', { targetUserId, type, data });
  }

  onDMCallIncoming(cb) { this.socket?.on('dm:call:incoming', cb); }
  offDMCallIncoming(cb) { this.socket?.off('dm:call:incoming', cb); }
  onDMCallAccepted(cb) { this.socket?.on('dm:call:accepted', cb); }
  offDMCallAccepted(cb) { this.socket?.off('dm:call:accepted', cb); }
  onDMCallRejected(cb) { this.socket?.on('dm:call:rejected', cb); }
  offDMCallRejected(cb) { this.socket?.off('dm:call:rejected', cb); }
  onDMCallEnded(cb) { this.socket?.on('dm:call:ended', cb); }
  offDMCallEnded(cb) { this.socket?.off('dm:call:ended', cb); }
  onDMCallSignal(cb) { this.socket?.on('dm:call:signal', cb); }
  offDMCallSignal(cb) { this.socket?.off('dm:call:signal', cb); }

  // Friend online/offline presence
  onFriendsOnlineList(cb) { this.socket?.on('friends:online:list', cb); }
  offFriendsOnlineList(cb) { this.socket?.off('friends:online:list', cb); }

  onFriendOnline(cb) { this.socket?.on('friend:online', cb); }
  offFriendOnline(cb) { this.socket?.off('friend:online', cb); }

  onFriendOffline(cb) { this.socket?.on('friend:offline', cb); }
  offFriendOffline(cb) { this.socket?.off('friend:offline', cb); }

  // Mood
  updateMood(mood) { this.socket?.emit('user:mood:update', { mood }); }
  onFriendMoodUpdated(cb) { this.socket?.on('friend:mood:updated', cb); }
  offFriendMoodUpdated(cb) { this.socket?.off('friend:mood:updated', cb); }

  // Status
  updateStatus(status) { this.socket?.emit('user:status:update', { status }); }
  onFriendStatusUpdated(cb) { this.socket?.on('friend:status:updated', cb); }
  offFriendStatusUpdated(cb) { this.socket?.off('friend:status:updated', cb); }

  // Whisper messages
  sendWhisper(targetUserId, text) { this.socket?.emit('whisper:send', { targetUserId, text }); }
  onWhisperReceived(cb) { this.socket?.on('whisper:received', cb); }
  offWhisperReceived(cb) { this.socket?.off('whisper:received', cb); }

  // Pinned messages
  pinMessage(messageId) { this.socket?.emit('message:pin', { messageId }); }
  onPinnedUpdated(cb) { this.socket?.on('message:pinned:updated', cb); }
  offPinnedUpdated(cb) { this.socket?.off('message:pinned:updated', cb); }

  // Ambience status
  setAmbience(trackId, emoji, name) { this.socket?.emit('user:ambience', { trackId, emoji, name }); }
  onAmbienceUpdated(cb) { this.socket?.on('user:ambience:updated', cb); }
  offAmbienceUpdated(cb) { this.socket?.off('user:ambience:updated', cb); }

  // Message edit/delete
  editMessage(messageId, text) { this.socket?.emit('message:edit', { messageId, text }); }
  deleteMessage(messageId) { this.socket?.emit('message:delete', { messageId }); }
  onMessageEdited(cb) { this.socket?.on('message:edited', cb); }
  offMessageEdited(cb) { this.socket?.off('message:edited', cb); }
  onMessageDeleted(cb) { this.socket?.on('message:deleted', cb); }
  offMessageDeleted(cb) { this.socket?.off('message:deleted', cb); }

  // Reactions
  toggleReaction(messageId, emoji) { this.socket?.emit('reaction:toggle', { messageId, emoji }); }
  onReactionUpdated(cb) { this.socket?.on('reaction:updated', cb); }
  offReactionUpdated(cb) { this.socket?.off('reaction:updated', cb); }

  // Cafe hours
  onCafeClosed(cb) { this.socket?.on('cafe:closed', cb); }
  offCafeClosed(cb) { this.socket?.off('cafe:closed', cb); }

  // Threads
  sendThreadReply(parentId, text, media, replyTo) {
    this.socket?.emit('thread:send', {
      parentId,
      text,
      ...(media && { mediaUrl: media.url, mediaType: media.mediaType, mediaName: media.mediaName }),
      ...(replyTo && { replyToId: replyTo.id, replyTo: { id: replyTo.id, text: replyTo.text, sender: replyTo.sender, mediaType: replyTo.mediaType } }),
    });
  }
  onThreadReply(cb) { this.socket?.on('thread:reply', cb); }
  offThreadReply(cb) { this.socket?.off('thread:reply', cb); }

  // Polls
  onPollCreated(cb) { this.socket?.on('poll:created', cb); }
  offPollCreated(cb) { this.socket?.off('poll:created', cb); }
  onPollVoted(cb) { this.socket?.on('poll:voted', cb); }
  offPollVoted(cb) { this.socket?.off('poll:voted', cb); }

  // Sticky Board
  onStickyNew(cb) { this.socket?.on('sticky:new', cb); }
  offStickyNew(cb) { this.socket?.off('sticky:new', cb); }
  onStickyRemoved(cb) { this.socket?.on('sticky:removed', cb); }
  offStickyRemoved(cb) { this.socket?.off('sticky:removed', cb); }
  onStickyTagged(cb) { this.socket?.on('sticky:tagged', cb); }
  offStickyTagged(cb) { this.socket?.off('sticky:tagged', cb); }

  // ─── Lost & Found (real-time broadcasts) ───
  onLostFoundNew(cb) { this.socket?.on('lostfound:new', cb); }
  offLostFoundNew(cb) { this.socket?.off('lostfound:new', cb); }
  onLostFoundReply(cb) { this.socket?.on('lostfound:reply', cb); }
  offLostFoundReply(cb) { this.socket?.off('lostfound:reply', cb); }
  onLostFoundResolved(cb) { this.socket?.on('lostfound:resolved', cb); }
  offLostFoundResolved(cb) { this.socket?.off('lostfound:resolved', cb); }

  // ─── Cafe Bulletin (real-time broadcasts) ───
  onBulletinNew(cb) { this.socket?.on('bulletin:new', cb); }
  offBulletinNew(cb) { this.socket?.off('bulletin:new', cb); }
  onBulletinRemoved(cb) { this.socket?.on('bulletin:removed', cb); }
  offBulletinRemoved(cb) { this.socket?.off('bulletin:removed', cb); }
  onBulletinStarred(cb) { this.socket?.on('bulletin:starred', cb); }
  offBulletinStarred(cb) { this.socket?.off('bulletin:starred', cb); }

  // ─── Empty Chair ───
  emptyChairJoin() { this.socket?.emit('emptychair:join'); }
  emptyChairCancel() { this.socket?.emit('emptychair:cancel'); }
  emptyChairSendMessage(text) { this.socket?.emit('emptychair:message', { text }); }
  emptyChairLeave() { this.socket?.emit('emptychair:leave'); }
  emptyChairReveal() { this.socket?.emit('emptychair:reveal'); }
  emptyChairExtend() { this.socket?.emit('emptychair:extend'); }

  onEmptyChairQueued(cb) { this.socket?.on('emptychair:queued', cb); }
  offEmptyChairQueued(cb) { this.socket?.off('emptychair:queued', cb); }
  onEmptyChairMatched(cb) { this.socket?.on('emptychair:matched', cb); }
  offEmptyChairMatched(cb) { this.socket?.off('emptychair:matched', cb); }
  onEmptyChairMessage(cb) { this.socket?.on('emptychair:message', cb); }
  offEmptyChairMessage(cb) { this.socket?.off('emptychair:message', cb); }
  onEmptyChairEnded(cb) { this.socket?.on('emptychair:ended', cb); }
  offEmptyChairEnded(cb) { this.socket?.off('emptychair:ended', cb); }
  onEmptyChairRevealed(cb) { this.socket?.on('emptychair:revealed', cb); }
  offEmptyChairRevealed(cb) { this.socket?.off('emptychair:revealed', cb); }
  onEmptyChairCancelled(cb) { this.socket?.on('emptychair:cancelled', cb); }
  offEmptyChairCancelled(cb) { this.socket?.off('emptychair:cancelled', cb); }
  onEmptyChairError(cb) { this.socket?.on('emptychair:error', cb); }
  offEmptyChairError(cb) { this.socket?.off('emptychair:error', cb); }
  onEmptyChairExtended(cb) { this.socket?.on('emptychair:extended', cb); }
  offEmptyChairExtended(cb) { this.socket?.off('emptychair:extended', cb); }
  onEmptyChairExtendRequested(cb) { this.socket?.on('emptychair:extend:requested', cb); }
  offEmptyChairExtendRequested(cb) { this.socket?.off('emptychair:extend:requested', cb); }
  onEmptyChairExtendWaiting(cb) { this.socket?.on('emptychair:extend:waiting', cb); }
  offEmptyChairExtendWaiting(cb) { this.socket?.off('emptychair:extend:waiting', cb); }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;
