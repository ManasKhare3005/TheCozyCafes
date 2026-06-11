# P1 Growth Metrics

## North-Star Metric

Weekly meaningful conversations.

A meaningful conversation is a room, DM, or Empty Chair session where at least two users each send at least one message within a 24-hour window.

Why this metric:

- It rewards real interaction, not empty signups.
- It fits the product wedge: calmer, cozier chat that still creates connection.
- It can be segmented by room type, Empty Chair, referrals, and returning users.

## Activation Funnel

Track these funnel steps in PostHog:

- `app_loaded`
- `signup_completed`
- `email_verified`
- `room_joined` or `room_created`
- `message_sent`
- Second user reply within 24 hours

Activation target: a new user joins or creates a room and sends one message during the first session.

## Retention

Create PostHog cohorts:

- D1 retained: signed up and returned between 24 and 48 hours later.
- D7 retained: signed up and returned between 7 and 8 days later.
- D30 retained: signed up and returned between 30 and 31 days later.

Use `app_loaded`, `message_sent`, `dm_sent`, and `emptychair_matched` as return signals. Prefer conversation events over page loads when reporting investor-facing retention.

## Referral Metric

Track invited signup rate:

- Visitor arrives with `?ref=<code>`.
- Visitor completes `signup_completed`.
- New user reaches activation.

The user model stores `referralCode` and `referredById`; use these fields for database-backed referral analysis.
