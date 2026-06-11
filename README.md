# Chatroom

A real-time chat application built with React, Node.js, Express, Socket.IO, and PostgreSQL.

## Features
- ✅ User authentication (register/login with JWT)
- ✅ Real-time messaging with WebSockets
- ✅ Message persistence (PostgreSQL)
- ✅ Chat history loads on login
- ✅ Join/leave notifications
- ✅ Online users list
- ✅ Typing indicators
- ✅ Incognito mode (ephemeral messages)
- ✅ Auto-scroll to new messages

## Upcoming Features
- 🔜 Multiple chat rooms
- 🔜 Anonymous mode toggle per room
- 🔜 Image/video sharing

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

1. **Install server dependencies:**
```bash
cd server
npm install
```

2. **Set up the database:**

Update `server/.env` with your PostgreSQL connection string:
```
DATABASE_URL="postgresql://username:password@localhost:5432/chatroom?schema=public"
```

Then run:
```bash
cd server
npm run db:push
```

3. **Install client dependencies:**
```bash
cd client
npm install
```

### Running the App

1. **Start the server** (in one terminal):
```bash
cd server
npm run dev
```
Server will run on http://localhost:3001

2. **Start the client** (in another terminal):
```bash
cd client
npm run dev
```
Client will run on http://localhost:5173

3. Open http://localhost:5173, create an account, and start chatting!

### Testing Real-time Features
- Open multiple browser tabs/windows
- Register different users in each
- Test real-time message delivery, typing indicators, and online user updates

## Docker Compose

The project includes Dockerfiles for `Client` and `Server`, plus a root `docker-compose.yml` with Postgres and Redis.

Start the stack:

```bash
docker compose up --build
```

Apply the Prisma schema to the local Compose database:

```bash
docker compose exec server npm run db:push
```

Then open:

- Client: http://localhost:5173
- Server health: http://localhost:3001/health
- Server readiness: http://localhost:3001/ready

Redis is included and used by Socket.IO when `REDIS_URL` is set, which keeps room broadcasts working across multiple server instances.

## CI

GitHub Actions runs:

- Server dependency install
- Prisma validate and generate
- Server JavaScript syntax check
- Server controller tests
- Client production build
- Production dependency audits for both apps

The workflow lives at `.github/workflows/ci.yml`.
The deploy workflow lives at `.github/workflows/deploy.yml`; setup notes are in `docs/cd-pipeline.md`.

Run server tests locally:

```bash
cd Server
npm test
npm run test:coverage
```

## Observability

The server emits structured JSON logs with Pino. Set `LOG_LEVEL=debug`, `info`, `warn`, or `error`.

Sentry error tracking is enabled when `SENTRY_DSN` is set. For production, the server refuses to boot without the required safety and integration environment variables.

```bash
SENTRY_DSN=https://PUBLIC_KEY@o000000.ingest.sentry.io/0000000
SENTRY_ENVIRONMENT=staging
SENTRY_TRACES_SAMPLE_RATE=0
```

For production behind a TLS-terminating proxy, set:

```bash
ENFORCE_HTTPS=true
TRUST_PROXY=1
HTTPS_REDIRECT_ORIGIN=https://your-domain.example
HSTS_MAX_AGE=31536000
```

Use `/health` for a basic process check and `/ready` for dependency-aware uptime checks.

## Backups and Recovery

Local Docker backup scripts live in `scripts/`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1
```

Restore rehearsals and production recovery policy are documented in `docs/backup-and-disaster-recovery.md`.

## Production Launch

The P0 launch runbook lives in `docs/production-launch-runbook.md`, and the current P0 checklist status lives in `docs/p0-launch-status.md`. Provider setup, monitoring, and CD details live in `docs/production-provider-setup.md`, `docs/monitoring-and-alerting.md`, and `docs/cd-pipeline.md`.

Draft legal pages are served from `Client/public/legal/`:

- `/legal/privacy.html`
- `/legal/terms.html`
- `/legal/cookies.html`
- `/legal/dmca.html`
- `/legal/moderation.html`

P3/P4 launch and positioning assets:

- Public launch page: `/launch.html`
- Support page: `/support.html`
- Public roadmap: `/roadmap.html`
- Changelog: `/changelog.html`
- Beta status page: `/status.html`
- P3/P4 status: `docs/p3-p4-launch-status.md`
- Growth launch plan: `docs/p3-growth-launch-plan.md`
- Differentiation strategy: `docs/p4-differentiation-strategy.md`

## Project Structure

```
chatroom/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── context/        # Auth context
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # Socket service
│   │   └── App.jsx         # Main app component
│   └── ...
├── server/                 # Node.js backend
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── src/
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Auth middleware
│   │   ├── routes/         # API routes
│   │   ├── socket/         # Socket.IO handlers
│   │   ├── lib/            # Utilities (prisma, jwt)
│   │   └── index.js        # Server entry point
│   └── ...
└── README.md
```

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Node.js, Express, Socket.IO
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** JWT (JSON Web Tokens)
- **Real-time:** WebSockets via Socket.IO

## Environment Variables

### Server (`server/.env`)
```
PORT=3001
CLIENT_URL=http://localhost:5173
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
```

### Client (`client/.env`)
```
VITE_SOCKET_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001/api
```
