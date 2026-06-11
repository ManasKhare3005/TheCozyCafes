# Backup and Disaster Recovery

This runbook is the operational baseline for Chat Room Cafe data recovery.

## Recovery Targets

- Recovery Point Objective: 24 hours at launch.
- Recovery Time Objective: 4 hours at launch.
- Backup retention: 30 days.
- Restore test cadence: quarterly, plus before major production migrations.

## Production Policy

Use managed Postgres automated backups from the production database provider as the source of truth. Enable:

- Daily automated backups.
- 30-day retention.
- Point-in-time recovery if the provider supports it.
- Restore testing into a non-production database.

The local scripts in `scripts/` are for Docker Compose validation, manual exports, and rehearsing the restore procedure. For production, prefer provider-native backups and use these scripts only when operating against an approved target.

## Local Backup

Start the stack first:

```powershell
docker compose up -d postgres redis server
```

Create a compressed custom-format dump:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1
```

By default this writes to `backups/` and removes local backup files older than 30 days.

## Local Restore Rehearsal

Restore into a temporary database, not the active app database:

```powershell
$backup = powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\restore-postgres.ps1 -BackupPath $backup -Database chatroom_restore_check -DropExisting
docker compose exec postgres psql -U postgres -d chatroom_restore_check -c "\dt"
```

Clean up the rehearsal database:

```powershell
docker compose exec postgres dropdb -U postgres --if-exists chatroom_restore_check
```

## Production Restore Checklist

1. Declare an incident owner and freeze deploys.
2. Identify the restore point and confirm business impact.
3. Restore into a new database instance or staging database first.
4. Run application smoke checks against the restored database.
5. Point the app to the restored database during a maintenance window.
6. Verify `/ready`, signup/login, room load, message send, and media upload paths.
7. Preserve old database snapshots until the incident review is complete.
8. Write a post-incident note with root cause, data loss window, and prevention tasks.

## Quarterly Restore Test Evidence

Record each restore test here or in the team issue tracker:

- Date:
- Operator:
- Backup source:
- Restored target:
- Smoke checks passed:
- Issues found:
- Follow-up tasks:
