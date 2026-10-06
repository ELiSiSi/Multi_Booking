#Requires -Version 5.1

param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$AdminEmail = "admin@reservio.local",
    [string]$AdminPassword = "AdminPassword!123"
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot/_helpers.ps1"

Initialize-Smoke -BaseUrl $BaseUrl -AdminEmail $AdminEmail -AdminPassword $AdminPassword

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Magenta
Write-Host "  RESERVIO API - FULL SMOKE TEST" -ForegroundColor Magenta
Write-Host "=======================================================" -ForegroundColor Magenta
Write-Host "  Base URL: $($Global:Smoke.BaseUrl)"
Write-Host "  Admin:    $($Global:Smoke.AdminEmail)"
Write-Host ""

$health = Invoke-Api -Method GET -Path "/health"
if ($health.StatusCode -ne 200) {
    Write-Host ""
    Write-Host "API is not reachable at $($Global:Smoke.BaseUrl)" -ForegroundColor Red
    Write-Host "Start it with: pnpm dev:api" -ForegroundColor Red
    exit 1
}

$startedAt = Get-Date

$sections = @(
    "01-auth.ps1",
    "02-business.ps1",
    "03-location.ps1",
    "04-service.ps1",
    "05-resource.ps1",
    "06-service-resource.ps1",
    "07-availability-rules.ps1",
    "08-availability-exceptions.ps1",
    "09-availability.ps1",
    "10-bookings.ps1"
)

foreach ($file in $sections) {
    $path = Join-Path $PSScriptRoot $file
    if (-not (Test-Path $path)) {
        Write-Host "Missing smoke file: $file" -ForegroundColor Red
        exit 1
    }

    . $path

    if ($Global:Smoke.Failed -gt 0) {
        Write-Host ""
        Write-Host "Aborting remaining sections: $($Global:Smoke.Failed) failure(s) so far." -ForegroundColor Red
        break
    }
}

$elapsed = (Get-Date) - $startedAt

Print-SmokeSummary

Write-Host ""
Write-Host "  Duration: $([math]::Round($elapsed.TotalSeconds, 2))s" -ForegroundColor Gray
Write-Host ""