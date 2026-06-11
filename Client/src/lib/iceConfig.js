// Shared WebRTC ICE configuration.
//
// STUN alone fails for users behind symmetric NAT or strict firewalls
// (common on campus/corporate networks) — a TURN relay is required for
// those connections. Configure one via env:
//
//   VITE_TURN_URL=turn:turn.example.com:3478   (comma-separate multiple URLs)
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const turnUrl = import.meta.env.VITE_TURN_URL;
if (turnUrl) {
  iceServers.push({
    urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
    username: import.meta.env.VITE_TURN_USERNAME || undefined,
    credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
  });
}

export const ICE_CONFIG = { iceServers };
