#Requires -Version 5.1
#
# 06 — ServiceResource endpoints
# Covers: assign, duplicate, list, unassign.
# Note: Leaves the assignment ACTIVE for later sections (availability needs it).
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "06. ServiceResource"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId
$locId    = $Global:Smoke.LocationId
$svcId    = $Global:Smoke.ServiceId
$resId    = $Global:Smoke.ResourceId

if (-not $svcId -or -not $resId) {
    Write-Host "ServiceId/ResourceId missing. Run 04/05 first." -ForegroundColor Red
    exit 1
}

$basePath = "/businesses/$bizId/locations/$locId/services/$svcId/resources"

# ─── Assign ──────────────────────────────────────────────────
$assignPath = "$basePath/$resId"

$assign = Invoke-Api -Method POST -Path $assignPath -Headers $auth
Assert-Status "POST /assign (201)" $assign.StatusCode 201

# ─── Duplicate assign ────────────────────────────────────────
$dup = Invoke-Api -Method POST -Path $assignPath -Headers $auth
Assert-Status "POST /assign (duplicate -> 409)" $dup.StatusCode 409

# ─── Unknown resource ────────────────────────────────────────
$unknown = Invoke-Api -Method POST -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth
Assert-Status "POST /assign (unknown resource -> 404)" $unknown.StatusCode 404

# ─── Unknown service ─────────────────────────────────────────
$unknownSvc = Invoke-Api -Method POST -Path "/businesses/$bizId/locations/$locId/services/00000000-0000-0000-0000-000000000000/resources/$resId" -Headers $auth
Assert-Status "POST /assign (unknown service -> 404)" $unknownSvc.StatusCode 404

# ─── Bad UUID ────────────────────────────────────────────────
$badUuid = Invoke-Api -Method POST -Path "/businesses/$bizId/locations/$locId/services/$svcId/resources/not-a-uuid" -Headers $auth
Assert-Status "POST /assign (bad uuid -> 400)" $badUuid.StatusCode 400

# ─── Customer role ───────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path $assignPath -Headers $custAuth
Assert-Status "POST /assign (customer -> 403)" $custTry.StatusCode 403

# ─── No auth ─────────────────────────────────────────────────
$noAuth = Invoke-Api -Method POST -Path $assignPath
Assert-Status "POST /assign (no auth -> 401)" $noAuth.StatusCode 401

# ─── List assignments ────────────────────────────────────────
$list = Invoke-Api -Method GET -Path $basePath -Headers $auth
Assert-Status "GET /assignments" $list.StatusCode 200

$listCount = $list.Body.data.Count
Assert-True "At least 1 assignment present" ($listCount -ge 1)

# ─── List for unknown service ────────────────────────────────
$listUnknown = Invoke-Api -Method GET -Path "/businesses/$bizId/locations/$locId/services/00000000-0000-0000-0000-000000000000/resources" -Headers $auth
Assert-Status "GET /assignments (unknown service -> 404)" $listUnknown.StatusCode 404

# Note: unassign is deferred to the cleanup section in 09-availability.ps1
# because the availability test needs the assignment to exist.