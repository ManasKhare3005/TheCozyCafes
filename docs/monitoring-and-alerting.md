# Monitoring And Alerting

The app already exposes:

- `GET /health`: process-level check.
- `GET /ready`: database and Redis readiness check.

## Launch Monitors

Create these after production deploy:

- API readiness: `https://api.your-domain.example/ready`, every 60 seconds, alert after 2 failures.
- Client home page: `https://app.your-domain.example/`, every 60 seconds, alert after 2 failures.
- Auth smoke check: manual or synthetic signup/login check after each deploy.
- 5xx error rate: alert from the host or Sentry when elevated for 5 minutes.
- Sentry new issue: email or chat alert immediately.
- Sentry performance: alert on sustained high p95 API latency once traffic is real.

## Alert Contacts

Fill these before launch:

- Primary on-call:
- Backup on-call:
- Support inbox:
- Incident channel:

## Incident Triage

1. Check `/ready`.
2. Check host deploy status.
3. Check Sentry new issues.
4. Check Postgres and Redis provider dashboards.
5. Roll back or freeze deploys if user impact is active.
