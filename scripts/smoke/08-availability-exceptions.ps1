#Requires -Version 5.1
#
# 08 — Availability Exceptions CRUD
# Covers: CLOSED, CUSTOM_HOURS, BREAK, validation, list, patch, delete.
# Populates: ExceptionId (a CLOSED exception on a future date).
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "08. Availability Exceptions"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId
$locId    = $Global:Smoke.LocationId
$resId    = $Global:Smoke.ResourceId

if (-not $resId) {
    Write-Host "ResourceId missing. Run 05 first." -ForegroundColor Red
    exit 1
}

$basePath = "/businesses/$bizId/locations/$locId/resources/$resId/availability-exceptions"

# ─── CLOSED ──────────────────────────────────────────────────
$createClosed = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date   = "2028-12-25"
    type   = "CLOSED"
    reason = "Christmas"
}
Assert-Status "POST /availability-exceptions (CLOSED 201)" $createClosed.StatusCode 201

if ($createClosed.StatusCode -ne 201) {
    Write-Host "Cannot continue without exception id." -ForegroundColor Red
    exit 1
}

$Global:Smoke.ExceptionId = $createClosed.Body.data.id
Assert-True "Exception id captured" ($null -ne $Global:Smoke.ExceptionId)

# ─── CUSTOM_HOURS ────────────────────────────────────────────
$createCustom = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date      = "2028-12-26"
    type      = "CUSTOM_HOURS"
    startTime = "10:00"
    endTime   = "14:00"
}
Assert-Status "POST /availability-exceptions (CUSTOM_HOURS 201)" $createCustom.StatusCode 201

# ─── BREAK ───────────────────────────────────────────────────
$createBreak = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date      = "2028-12-27"
    type      = "BREAK"
    startTime = "12:00"
    endTime   = "13:00"
}
Assert-Status "POST /availability-exceptions (BREAK 201)" $createBreak.StatusCode 201

# ─── Validation ──────────────────────────────────────────────
$closedWithTime = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date      = "2028-12-28"
    type      = "CLOSED"
    startTime = "09:00"
}
Assert-Status "POST /availability-exceptions (CLOSED+time -> 400)" $closedWithTime.StatusCode 400

$customNoTime = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date = "2028-12-29"
    type = "CUSTOM_HOURS"
}
Assert-Status "POST /availability-exceptions (CUSTOM_HOURS no time -> 400)" $customNoTime.StatusCode 400

$breakReverse = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date      = "2028-12-30"
    type      = "BREAK"
    startTime = "13:00"
    endTime   = "12:00"
}
Assert-Status "POST /availability-exceptions (BREAK start>=end -> 400)" $breakReverse.StatusCode 400

$badDate = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date = "not-a-date"
    type = "CLOSED"
}
Assert-Status "POST /availability-exceptions (bad date -> 400)" $badDate.StatusCode 400

$badType = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date = "2028-12-31"
    type = "INVALID"
}
Assert-Status "POST /availability-exceptions (bad type -> 400)" $badType.StatusCode 400

$missing = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{}
Assert-Status "POST /availability-exceptions (missing fields -> 400)" $missing.StatusCode 400

# ─── Role + auth ─────────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path $basePath -Headers $custAuth -Body @{
    date = "2029-01-01"
    type = "CLOSED"
}
Assert-Status "POST /availability-exceptions (customer -> 403)" $custTry.StatusCode 403

$noAuth = Invoke-Api -Method POST -Path $basePath -Body @{
    date = "2029-01-01"
    type = "CLOSED"
}
Assert-Status "POST /availability-exceptions (no auth -> 401)" $noAuth.StatusCode 401

# ─── List ────────────────────────────────────────────────────
$list = Invoke-Api -Method GET -Path $basePath -Headers $auth
Assert-Status "GET /availability-exceptions" $list.StatusCode 200

Assert-True "Multiple exceptions returned" ($list.Body.data.Count -ge 3)

# ─── Patch ───────────────────────────────────────────────────
$excId = $Global:Smoke.ExceptionId

$patch = Invoke-Api -Method PATCH -Path "$basePath/$excId" -Headers $auth -Body @{
    reason = "Christmas (updated)"
}
Assert-Status "PATCH /availability-exceptions/:id (reason)" $patch.StatusCode 200

# Create a temp BREAK, then switch to CLOSED → times should clear
$tempBreak = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date      = "2029-02-01"
    type      = "BREAK"
    startTime = "10:00"
    endTime   = "11:00"
}
$tempId = $tempBreak.Body.data.id

$switchToClosed = Invoke-Api -Method PATCH -Path "$basePath/$tempId" -Headers $auth -Body @{
    type = "CLOSED"
}
Assert-Status "PATCH /availability-exceptions/:id (switch to CLOSED)" $switchToClosed.StatusCode 200
Assert-True "Times cleared when switching to CLOSED" (
    $null -eq $switchToClosed.Body.data.startTime -and
    $null -eq $switchToClosed.Body.data.endTime
)

# Cleanup temp
$delTemp = Invoke-Api -Method DELETE -Path "$basePath/$tempId" -Headers $auth
Assert-Status "DELETE temp exception (204)" $delTemp.StatusCode 204

$patchEmpty = Invoke-Api -Method PATCH -Path "$basePath/$excId" -Headers $auth -Body @{}
Assert-Status "PATCH /availability-exceptions/:id (empty body -> 400)" $patchEmpty.StatusCode 400

$patchUnknown = Invoke-Api -Method PATCH -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth -Body @{
    reason = "Ghost"
}
Assert-Status "PATCH /availability-exceptions/:id (unknown -> 404)" $patchUnknown.StatusCode 404

# ─── Delete (single test) ────────────────────────────────────
# Create a temporary exception then delete it.
$delCreate = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    date = "2029-03-01"
    type = "CLOSED"
}
$delId = $delCreate.Body.data.id

$del = Invoke-Api -Method DELETE -Path "$basePath/$delId" -Headers $auth
Assert-Status "DELETE /availability-exceptions/:id (204)" $del.StatusCode 204

$delAgain = Invoke-Api -Method DELETE -Path "$basePath/$delId" -Headers $auth
Assert-Status "DELETE /availability-exceptions/:id (again -> 404)" $delAgain.StatusCode 404