# P0 Launch Status

Updated: June 10, 2026

## Current Assumption

Legal and business formalities are not done yet. The repo contains legal drafts and compliance controls, but those do not make the product legally launch-ready until you replace placeholder contacts, choose the business path, and get proper review.

Latest local sweep: no remaining repo-only P0 task is known. The rest of P0 requires real provider accounts, production secrets, production infrastructure, legal review, or business setup.

## Count

- Done with no known local repo work remaining: 14 / 39
- Code/draft/scaffold exists, but launch still needs owner, provider, or legal action: 16 / 39
- Not started / requires owner action: 9 / 39
- Not fully finished for public launch: 25 / 39

## Done

- HTTPS redirect support, HSTS, CSP, frame, referrer, and related security headers.
- Message rendering audit: no `dangerouslySetInnerHTML` usage found in source.
- Socket.IO event-level rate limits and authorization hardening.
- Account lockout after repeated failed logins.
- Password reset flow with expiring tokens.
- Email verification flow.
- COPPA-style 13+ signup gate and underage signup blocking.
- Dockerfiles and Docker Compose for app, Postgres, and Redis.
- Disaster recovery runbook.
- GitHub Actions CI for install, Prisma, syntax, tests, build, audits, and secret scanning.
- `getMyRooms` unread-count N+1 query fix.
- Pino structured logging.
- Server critical-path coverage target: 66 tests pass with 60.76% line coverage.
- Production readiness guard that refuses unsafe production env defaults.

## Supporting P0 Tools

- `scripts/check-secrets.mjs`: scans for committed secrets.
- `scripts/check-production-readiness.mjs`: validates real server/client production env files before deploy.
- `docs/production-provider-setup.md`: provider setup order and preflight.
- `docs/monitoring-and-alerting.md`: production monitor and alert checklist.
- `docs/cd-pipeline.md`: staging and production deployment workflow setup.

## Code Or Draft Done, But Not Launch-Cleared

- Strong JWT secret: documented and enforced, but you still need to generate and set the real production value.
- `.env` protection/history: ignore rules and scanner exist, but any previously committed secrets must be scrubbed before a public push.
- hCaptcha: client widget and server verification exist, but real site key/secret must be configured.
- Privacy Policy: draft page exists; legal review and real contact details are pending.
- Terms of Service: draft page exists; legal review and real contact details are pending.
- Storage/cookie notice: page and in-app notice exist; GDPR/ePrivacy review is pending if you allow EU traffic.
- GDPR-style data export and account deletion: product controls exist; full legal review and retention policy are pending.
- CCPA: access/delete basics exist; California-specific policy review is pending.
- DMCA process: page, contact placeholder, and response timing exist; replace `dmca@example.com` and have counsel review.
- Content moderation policy: draft exists; appeal/process review is pending.
- Redis: Socket.IO adapter works; broader session-cache usage is not needed unless server-side sessions are added.
- Database backups: local scripts and DR docs exist; production managed backup policy must be enabled at the provider.
- Error tracking: Sentry code exists; production DSN and alert rules must be configured.
- APM: Sentry performance hooks exist; production sampling and thresholds must be configured.
- Uptime monitoring: `/ready` exists and runbook covers monitors; provider monitor still needs setup.
- CD pipeline: GitHub workflow scaffold exists; host deploy hooks and GitHub environments must be configured after choosing a host.

## Not Started / Requires Owner Action

- Rotate leaked Groq, Cloudinary, and GIPHY keys in provider dashboards.
- Move production secrets into a managed secret store.
- Register business entity.
- Get EIN, bank account, bookkeeping, and insurance.
- Run trademark check and decide whether to keep "Chat Room Cafe".
- Pick and deploy to a production host.
- Provision managed Postgres.
- Configure CDN.
- Configure custom domain and SSL.

## Legal Formalities Parking Lot

Do not mark these complete until you are closer to launch:

- Replace `support@example.com` and `dmca@example.com`.
- Decide LLC vs Delaware C-Corp.
- Register entity and get EIN.
- Open business bank account.
- Set up bookkeeping.
- Decide insurance timing.
- Review Privacy, Terms, DMCA, Cookie/Storage, and Moderation policies.
- Run trademark search for "Chat Room Cafe".
