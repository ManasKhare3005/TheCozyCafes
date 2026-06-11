# Production Provider Setup

Use this when you are ready to turn the P0 scaffolding into a real deployment.

## Order Of Operations

1. Rotate Groq, Cloudinary, and GIPHY keys.
2. Pick the production host, managed Postgres provider, Redis provider, and DNS/CDN provider.
3. Create staging and production environments in the host.
4. Put all server env vars from `Server/.env.production.example` into the host secret manager.
5. Put all client build vars from `Client/.env.production.example` into the client build environment.
6. Enable optional P1 providers: PostHog for analytics and Cloudinary image moderation if you want upload moderation active.
7. Configure GitHub `staging` and `production` environments.
8. Add `STAGING_DEPLOY_HOOK_URL` and `PRODUCTION_DEPLOY_HOOK_URL` as GitHub environment secrets.
9. Enable managed Postgres backups with 30-day retention.
10. Configure DNS, CDN, and TLS.
11. Run the smoke checklist in `docs/production-launch-runbook.md`.

P1 provider notes live in `docs/p1-ops-notes.md`.

## Local Preflight

Before deploying with real values, create local copies that are never committed:

```powershell
Copy-Item Server\.env.production.example Server\.env.production.local
Copy-Item Client\.env.production.example Client\.env.production.local
```

Fill in real values, then run:

```bash
node scripts/check-production-readiness.mjs --server-env Server/.env.production.local --client-env Client/.env.production.local
```

For template validation only:

```bash
node scripts/check-production-readiness.mjs --server-env Server/.env.production.example --client-env Client/.env.production.example --allow-placeholders
```

## Do Not Commit

- `Server/.env.production.local`
- `Client/.env.production.local`
- Provider exports containing tokens
- Database dumps
