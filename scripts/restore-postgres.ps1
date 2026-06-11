[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [string]$Service = "postgres",
  [string]$Database = "chatroom_restore_check",
  [string]$User = "postgres",
  [switch]$DropExisting,
  [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"

function Assert-SafeName($Name, $Label) {
  if ($Name -notmatch '^[A-Za-z0-9_.-]+$') {
    throw "$Label contains unsupported characters: $Name"
  }
}

Assert-SafeName $Service "Service"
Assert-SafeName $Database "Database"
Assert-SafeName $User "User"

$repoRoot = Split-Path -Parent $PSScriptRoot
$composePath = if ([System.IO.Path]::IsPathRooted($ComposeFile)) {
  $ComposeFile
} else {
  Join-Path $repoRoot $ComposeFile
}

if (-not (Test-Path -LiteralPath $composePath)) {
  throw "Compose file not found: $composePath"
}

$resolvedBackup = Resolve-Path -LiteralPath $BackupPath
if (-not $resolvedBackup) {
  throw "Backup not found: $BackupPath"
}

$containerId = docker compose -f $composePath ps -q $Service
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
  throw "Could not find a running Docker Compose service named '$Service'. Start the stack first."
}
$containerId = $containerId.Trim()

$containerRestorePath = "/tmp/restore-$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')).dump"

docker cp $resolvedBackup.Path "${containerId}:$containerRestorePath"
if ($LASTEXITCODE -ne 0) {
  throw "docker cp failed while copying backup into the database container"
}

try {
  if ($DropExisting) {
    docker compose -f $composePath exec -T $Service psql -U $User -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Database' AND pid <> pg_backend_pid();"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to terminate existing database connections for '$Database'"
    }

    docker compose -f $composePath exec -T $Service dropdb -U $User --if-exists $Database
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to drop existing database '$Database'"
    }
  }

  docker compose -f $composePath exec -T $Service createdb -U $User $Database
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create database '$Database'. Use -DropExisting for an intentional overwrite."
  }

  docker compose -f $composePath exec -T $Service pg_restore -U $User -d $Database --no-owner --no-privileges $containerRestorePath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed for database '$Database'"
  }
} finally {
  docker compose -f $composePath exec -T $Service rm -f $containerRestorePath | Out-Null
}

Write-Output "Restored $($resolvedBackup.Path) into database '$Database'"
