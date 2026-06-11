# P1 Checklist

Start this after the remaining P0 owner/provider/legal blockers are accepted or actively in progress.

Current count: 16 done, 4 provider/traffic-validation tasks remaining, 2 intentionally deferred.

## Moderation And Safety

- Add profanity and slur filtering for public chat surfaces. Baseline server-side filter is active in `Server/src/lib/contentSafety.js`; add high-severity terms through `CONTENT_BANNED_TERMS` in the secret manager.
- Add image moderation for uploads. Partially wired: Cloudinary moderation hook is available through `CLOUDINARY_UPLOAD_MODERATION`; enable the Cloudinary add-on before relying on it in production.
- Build admin queue UI for reports. Done in `Client/src/components/AdminModerationPanel.jsx`.
- Add admin actions: ban user, delete message, lock room. Done via report-scoped moderation endpoints.
- Add IP-level ban support. Done with hashed IP capture, HTTP/socket enforcement, admin IP-ban endpoints, and report-scoped IP-ban action.
- Expand spam detection beyond rate limits: repeated links, repeated messages, suspicious invites. Done for live chat, threads, edits, DMs, whispers, and Empty Chair messages.
- Add user-visible block management refinements. Done in `Client/src/components/BlockedUsersPanel.jsx`.

## Analytics And Growth

- Pick analytics provider: PostHog. Client integration is no-op unless `VITE_POSTHOG_KEY` is configured.
- Define north-star metric. Done in `docs/p1-growth-metrics.md`.
- Track funnel events: landing, signup, room create, first message, return D1/D7/D30. Partially wired: client events now cover app load, signup, login, email verification, room create/join, confirmed room message, DM, and Empty Chair flows. D1/D7/D30 cohorts still need to be created in PostHog.
- Add transactional email templates: welcome, verify, reset, safety notice. Done in `Server/src/lib/emailTemplates.js`.
- Add onboarding flow: first room, first friend, first message. Done with first-run onboarding modal and persisted completion.
- Add referral/invite system. Done with referral codes, `?ref=` signup capture, and copyable invite links.

## Performance

- Add k6 or Artillery socket load tests. Done in `load-tests/artillery-socket.yml`.
- Target 1000 concurrent sockets per server node before broad launch. Validation remains: run the Artillery hold phase against staging with seeded users.
- Run `EXPLAIN ANALYZE` on hot DB queries. Query pack exists in `scripts/query-analysis.sql`; run it against a staging data clone.
- Add missing indexes from query analysis. First-pass hot-path indexes are added; final tuning depends on staging `EXPLAIN ANALYZE`.
- Audit bundle size with Vite visualizer. Done with local bundle report script `npm run bundle:report`; heavy views are code-split.
- Code-split large routes/components. Admin moderation panel is lazy-loaded.
- Use Cloudinary WebP/AVIF transforms consistently. Done for Cloudinary image upload delivery URLs with `fetch_format: auto` and `quality: auto`.
- Consider service-worker offline queue only after core chat reliability is stable. Deferred intentionally until message delivery semantics and retry UX are specified.

## Tooling Hygiene

- Revisit the client dev-server audit finding when upgrading Vite/esbuild. Deferred until a safe Vite/esbuild upgrade path is chosen; production dependency audits are clean.

## P1 First Pick

Recommended first P1 task: admin moderation queue. It is the highest leverage post-P0 safety item because reports already exist in the API.
