# Socket Load Tests

This Artillery scenario exercises authenticated Socket.IO room join, typing, and message send flows.

## Run Locally

Install Artillery outside the app dependency tree or use `npx`:

```bash
LOAD_AUTH_TOKEN=<jwt-for-seeded-user> \
LOAD_ROOM_ID=<room-id-user-belongs-to> \
npx artillery run load-tests/artillery-socket.yml
```

For staging, pass `--target https://api.your-staging-domain.example`.

## P1 Target

Before broad launch, run this against staging and verify:

- 1000 concurrent sockets per server node.
- P95 message round trip remains acceptable for the product niche.
- Server CPU, memory, Redis adapter health, and Postgres connection usage stay within host limits.
- Error rate is below 1% during the hold phase.

Use a staging database with disposable seeded users and rooms. Do not run this against production without a maintenance window and alert suppression plan.
