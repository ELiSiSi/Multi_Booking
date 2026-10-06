#Requires -Version 5.1
#
# 07 — Availability Rules CRUD
# Covers: create (OPEN + BREAK), validation, list, patch, delete.
# Populates: RuleId (one OPEN rule for Monday).
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "07. Availability Rules"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId
$locId    = $Global:Smoke.LocationId
$resId    = $Global:Smoke.ResourceId

if (-not $resId) {
    Write-Host "ResourceId missing. Run 05 first." -ForegroundColor Red
    exit 1
}

$basePath = "/businesses/$bizId/locations/$locId/resources/$resId/availability-rules"

# ─── Create OPEN rule for Monday ─────────────────────────────
$createOpen = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday   = 1
    type      = "OPEN"
    startTime = "09:00"
    endTime   = "17:00"
}
Assert-Status "POST /availability-rules (OPEN 201)" $createOpen.StatusCode 201

if ($createOpen.StatusCode -ne 201) {
    Write-Host "Cannot continue without rule id." -ForegroundColor Red
    exit 1
}

$Global:Smoke.RuleId = $createOpen.Body.data.id
Assert-True "Rule id captured" ($null -ne $Global:Smoke.RuleId)

# ─── Create OPEN rule for Tuesday-Friday (filler) ────────────
foreach ($day in 2, 3, 4, 5) {
    $r = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
        weekday   = $day
        type      = "OPEN"
        startTime = "09:00"
        endTime   = "17:00"
    }
    Assert-Status "POST /availability-rules (OPEN weekday=$day)" $r.StatusCode 201
}

# ─── Create BREAK rule for Monday ────────────────────────────
$createBreak = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday   = 1
    type      = "BREAK"
    startTime = "13:00"
    endTime   = "14:00"
}
Assert-Status "POST /availability-rules (BREAK 201)" $createBreak.StatusCode 201

# ─── Effective range ─────────────────────────────────────────
$createRange = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday       = 6
    type          = "OPEN"
    startTime     = "10:00"
    endTime       = "14:00"
    effectiveFrom = "2027-01-01"
    effectiveTo   = "2027-12-31"
}
Assert-Status "POST /availability-rules (with effective range)" $createRange.StatusCode 201

# ─── Validation errors ───────────────────────────────────────
$weekday0 = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 0; type = "OPEN"; startTime = "09:00"; endTime = "17:00"
}
Assert-Status "POST /availability-rules (weekday=0 -> 400)" $weekday0.StatusCode 400

$weekday8 = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 8; type = "OPEN"; startTime = "09:00"; endTime = "17:00"
}
Assert-Status "POST /availability-rules (weekday=8 -> 400)" $weekday8.StatusCode 400

$badFormat = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 3; type = "OPEN"; startTime = "9:00"; endTime = "17:00"
}
Assert-Status "POST /availability-rules (9:00 bad format -> 400)" $badFormat.StatusCode 400

$reverseTime = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 3; type = "OPEN"; startTime = "17:00"; endTime = "09:00"
}
Assert-Status "POST /availability-rules (start>=end -> 400)" $reverseTime.StatusCode 400

$equalTime = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 3; type = "OPEN"; startTime = "09:00"; endTime = "09:00"
}
Assert-Status "POST /availability-rules (start==end -> 400)" $equalTime.StatusCode 400

$badType = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 3; type = "INVALID"; startTime = "09:00"; endTime = "17:00"
}
Assert-Status "POST /availability-rules (bad type -> 400)" $badType.StatusCode 400

$badRange = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday       = 3
    type          = "OPEN"
    startTime     = "09:00"
    endTime       = "17:00"
    effectiveFrom = "2027-12-31"
    effectiveTo   = "2027-01-01"
}
Assert-Status "POST /availability-rules (from > to -> 400)" $badRange.StatusCode 400

$missing = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    weekday = 3
}
Assert-Status "POST /availability-rules (missing fields -> 400)" $missing.StatusCode 400

# ─── Role + auth ─────────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path $basePath -Headers $custAuth -Body @{
    weekday = 3; type = "OPEN"; startTime = "09:00"; endTime = "17:00"
}
Assert-Status "POST /availability-rules (customer -> 403)" $custTry.StatusCode 403

$noAuth = Invoke-Api -Method POST -Path $basePath -Body @{
    weekday = 3; type = "OPEN"; startTime = "09:00"; endTime = "17:00"
}
Assert-Status "POST /availability-rules (no auth -> 401)" $noAuth.StatusCode 401

# ─── List ────────────────────────────────────────────────────
$list = Invoke-Api -Method GET -Path $basePath -Headers $auth
Assert-Status "GET /availability-rules" $list.StatusCode 200

Assert-True "Multiple rules returned" ($list.Body.data.Count -ge 5)

# ─── Patch ───────────────────────────────────────────────────
$ruleId = $Global:Smoke.RuleId

$patch = Invoke-Api -Method PATCH -Path "$basePath/$ruleId" -Headers $auth -Body @{
    endTime = "18:00"
}
Assert-Status "PATCH /availability-rules/:id (endTime)" $patch.StatusCode 200
Assert-True "endTime updated to 18:00" ($patch.Body.data.endTime -eq "18:00")

$patchBadTime = Invoke-Api -Method PATCH -Path "$basePath/$ruleId" -Headers $auth -Body @{
    startTime = "19:00"
}
Assert-Status "PATCH /availability-rules/:id (start>end -> 400)" $patchBadTime.StatusCode 400

$patchEmpty = Invoke-Api -Method PATCH -Path "$basePath/$ruleId" -Headers $auth -Body @{}
Assert-Status "PATCH /availability-rules/:id (empty body -> 400)" $patchEmpty.StatusCode 400

$patchUnknown = Invoke-Api -Method PATCH -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth -Body @{
    endTime = "18:00"
}
Assert-Status "PATCH /availability-rules/:id (unknown -> 404)" $patchUnknown.StatusCode 404

# Reset endTime back to 17:00 for the availability test
$reset = Invoke-Api -Method PATCH -Path "$basePath/$ruleId" -Headers $auth -Body @{
    endTime = "17:00"
}
Assert-Status "PATCH /availability-rules/:id (reset endTime)" $reset.StatusCode 200