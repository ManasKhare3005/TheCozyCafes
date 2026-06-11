[CmdletBinding()]
param(
  [string]$Service = "postgres",
  [string]$Database = "chatroom",
  [string]$User = "postgres",
  [string]$OutputDir = "backups",
  [int]$RetentionDays = 30,
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

$outputPath = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir
} else {
  Join-Path $repoRoot $OutputDir
}
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$containerId = docker compose -f $composePath ps -q $Service
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
  throw "Could not find a running Docker Compose service named '$Service'. Start the stack first."
}
$containerId = $containerId.Trim()

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "$Database-$timestamp.dump"
$containerDumpPath = "/tmp/$fileName"
$localDumpPath = Join-Path $outputPath $fileName

docker compose -f $composePath exec -T $Service pg_dump -U $User -d $Database -Fc -Z 9 -f $containerDumpPath
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed for database '$Database'"
}

try {
  docker cp "${containerId}:$containerDumpPath" $localDumpPath
  if ($LASTEXITCODE -ne 0) {
    throw "docker cp failed while copying backup to $localDumpPath"
  }
} finally {
  docker compose -f $composePath exec -T $Service rm -f $containerDumpPath | Out-Null
}

if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -Path $outputPath -Filter "$Database-*.dump" -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force
}

Write-Output $localDumpPath
