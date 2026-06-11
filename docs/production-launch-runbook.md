# Production Launch Runbook

This runbook tracks the P0 tasks that cannot be fully completed from local code alone.

## Secrets and Key Rotation

Before any public launch:

1. Rotate Groq, Cloudinary, and GIPHY keys in their provider dashboards.
2. Generate a production JWT secret:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
   ```

3. Store secrets only in the production host secret manager or a managed vault.
4. Never commit `.env` files.
5. Run the repository secret scanner before pushing:

   ```bash
   node scripts/check-secrets.mjs
   ```

6. If secrets were ever committed, scrub git history before making the repo public:

   ```bash
   git filter-repo --path Server/.env --invert-paths
   ```

   or use BFG Repo-Cleaner, then rotate the keys again.

## Required Production Environment

Set these before deploying with `NODE_ENV=production`:

```bash
NODE_ENV=production
CLIENT_URL=https://your-domain.example
APP_URL=https://your-domain.example
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<64-byte-random-secret>
REQUIRE_EMAIL_VERIFICATION=true
AUTH_DEBUG_TOKENS=false
ENFORCE_HTTPS=true
TRUST_PROXY=1
HTTPS_REDIRECT_ORIGIN=https://your-domain.example
SENTRY_DSN=<sentry-dsn>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05
HCAPTCHA_SECRET=<hcaptcha-secret>
RESEND_API_KEY=<resend-key>
EMAIL_FROM="Chat Room Cafe <noreply@your-domain.example>"
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
GROQ_API_KEY=<groq-key>
GIPHY_API_KEY=<giphy-key>
```

The server will refuse to boot in production if core safety settings are unsafe.
Use `Server/.env.production.example` and `Client/.env.production.example` as the deployment checklist, but store the real values in the host secret manager or GitHub environment secrets.
Validate real launch env files before deployment:

```bash
node scripts/check-production-readiness.mjs --server-env Server/.env.production.local --client-env Client/.env.production.local
```

## Hosting Decision

Pick one host and document it here:

- App host:
- Managed Postgres:
- Redis:
- CDN:
- Domain registrar/DNS:

Recommended first launch path: Railway or Fly.io for the app, Neon or Supabase for Postgres, provider Redis or Upstash Redis, and Cloudflare for DNS/CDN.

## Deployment Checklist

1. Provision managed Postgres and Redis.
2. Set all production env vars in the host secret manager.
3. Configure GitHub deployment environments and deploy hooks using `docs/cd-pipeline.md`.
4. Run Prisma schema push/migration against production only after backup is enabled.
5. Deploy server and client.
6. Point DNS to production.
7. Confirm TLS certificate issuance.
8. Verify HTTP redirects to HTTPS.
9. Verify `/health` and `/ready`.
10. Verify signup, email verification, password reset, room join, message send, upload, report, block, export, and delete account flows.
11. Configure uptime monitor against `/ready`.
12. Configure Sentry alerts for new issues and elevated error rate.

## Monitoring

Create monitors:

- `/ready` every 60 seconds, alert after 2 failed checks.
- Client home page every 60 seconds.
- 5xx rate alert from hosting provider or Sentry.
- Sentry new issue alert to email/Slack/Discord.

## Legal and Business

Current status: deferred. The repo has working drafts and product controls, but legal and business formalities are not done yet.

Before production:

- Replace `support@example.com` and `dmca@example.com` in legal pages.
- Have Privacy Policy, Terms, DMCA Policy, Cookie Notice, and Moderation Policy reviewed by counsel.
- Decide entity path: LLC for bootstrapped, Delaware C-Corp for VC path.
- Get EIN, bank account, bookkeeping, and business insurance.
- Run a trademark search for "Chat Room Cafe" and decide whether to rebrand.
