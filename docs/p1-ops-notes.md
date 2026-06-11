# P1 Ops Notes

## Content Safety

Server-side text safety runs before messages are saved or broadcast for:

- Room messages
- Thread replies
- Message edits
- Direct messages
- Room whispers
- Empty Chair messages

The built-in list covers a small baseline of profanity and harassment phrases. Put stronger and market-specific banned terms in `CONTENT_BANNED_TERMS` as a comma-separated secret. Do not commit high-severity slur lists to the repository.

Spam checks currently block:

- Too many links in one message
- Repeated identical links
- Invite/short-link bursts
- Very long repeated characters
- Repeated messages from the same socket
- Link bursts from the same socket

## Image Moderation

Set `CLOUDINARY_UPLOAD_MODERATION` to a Cloudinary moderation add-on identifier, such as the add-on enabled in your Cloudinary account. When Cloudinary returns a rejected moderation result, the server destroys the uploaded asset and returns `400`.

Without this env var, local development keeps the existing upload flow and only applies file type, file size, SVG blocking, and Cloudinary transformation safeguards.

## IP Bans

Set `IP_BAN_HASH_SECRET` to a stable high-entropy secret in every production runtime. Changing this secret invalidates previously stored IP-ban hashes.

The application stores hashed IPs only:

- `users.lastIpHash`
- `messages.senderIpHash`
- `direct_messages.senderIpHash`
- `moderation_reports.reporterIpHash`
- `moderation_reports.targetIpHash`
- `ip_bans.ipHash`

Admins can ban a report target IP from the moderation queue. The HTTP middleware and Socket.IO middleware both reject active IP bans.

## PostHog Events

Set these client build variables:

```bash
VITE_POSTHOG_KEY=<project-api-key>
VITE_POSTHOG_HOST=https://app.posthog.com
```

Tracked events:

- `app_loaded`
- `signup_completed`
- `login_completed`
- `email_verified`
- `logout`
- `room_created`
- `room_joined`
- `message_sent`
- `thread_reply_sent`
- `dm_sent`
- `emptychair_join_clicked`
- `emptychair_queued`
- `emptychair_matched`
- `emptychair_message_sent`
- `emptychair_reveal_clicked`
- `emptychair_cancelled`
- `emptychair_ended`

Create PostHog cohorts or dashboards for D1, D7, and D30 retention after production traffic starts.

## Referrals And Onboarding

Users receive a `referralCode` at signup. Invite links use:

```text
https://app.your-domain.example/?ref=<referralCode>
```

The signup form captures that code and stores `referredById` when it matches a known user. First-run onboarding completion is stored in `users.onboardingCompletedAt`.

## Performance Validation

Use:

- `load-tests/artillery-socket.yml` for authenticated Socket.IO load.
- `scripts/query-analysis.sql` for hot-query `EXPLAIN ANALYZE`.
- `npm run bundle:report` in `Client` after `npm run build` for local bundle size reporting.

The 1000-socket target and final index tuning require staging traffic/data; do not mark those externally complete until they are run against a staging clone.
