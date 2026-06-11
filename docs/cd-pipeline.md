# CD Pipeline

The deploy workflow is `.github/workflows/deploy.yml`.

## Behavior

- Pushes to `main` validate the release candidate and trigger the staging deploy hook.
- Manual workflow runs can deploy staging or promote production.
- Production promotion uses the `production` GitHub Environment, so add required reviewers in GitHub before launch.

## Required GitHub Secrets

Create these repository or environment secrets after choosing a host:

- `STAGING_DEPLOY_HOOK_URL`
- `PRODUCTION_DEPLOY_HOOK_URL`

Most hosts support deploy hooks, including Render and Railway. If the selected host does not support deploy hooks, replace the two `curl` steps with that provider's official deploy command.

## Recommended GitHub Variables

Set these repository variables so the client build points at staging during release validation:

- `STAGING_API_URL`
- `STAGING_SOCKET_URL`

Example values:

```text
STAGING_API_URL=https://staging-api.your-domain.example/api
STAGING_SOCKET_URL=https://staging-api.your-domain.example
```

## Production Environment Protection

In GitHub:

1. Open Settings -> Environments.
2. Create `staging` and `production`.
3. Add required reviewers to `production`.
4. Put production deploy hook secrets only in the `production` environment if you want tighter separation.
