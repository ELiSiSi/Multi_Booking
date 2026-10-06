#Requires -Version 5.1
#
# 02 — Business endpoints
# Covers: create, duplicate, list, patch, validation.
# Populates: BusinessId.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "02. Business"

$auth = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$bizName = "Smoke Biz $stamp"

# ─── Create ──────────────────────────────────────────────────
$create = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name     = $bizName
    timezone = "Africa/Cairo"
}
Assert-Status "POST /businesses (201)" $create.StatusCode 201

if ($create.StatusCode -ne 201) {
    Write-Host "Cannot continue without business id." -ForegroundColor Red
    exit 1
}

$Global:Smoke.BusinessId = $create.Body.data.id
Assert-True "Business id captured" ($null -ne $Global:Smoke.BusinessId)

# ─── Duplicate name ──────────────────────────────────────────
$dup = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name = $bizName
}
Assert-Status "POST /businesses (duplicate -> 409)" $dup.StatusCode 409

# ─── No auth ─────────────────────────────────────────────────
$noAuth = Invoke-Api -Method POST -Path "/businesses" -Body @{ name = "Anon" }
Assert-Status "POST /businesses (no auth -> 401)" $noAuth.StatusCode 401

# ─── Customer role ───────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path "/businesses" -Headers $custAuth -Body @{
    name = "Customer Biz"
}
Assert-Status "POST /businesses (customer -> 403)" $custTry.StatusCode 403

# ─── Empty name ──────────────────────────────────────────────
$emptyName = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name = "   "
}
Assert-Status "POST /businesses (empty name -> 400)" $emptyName.StatusCode 400

# ─── Missing name ────────────────────────────────────────────
$missingName = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{}
Assert-Status "POST /businesses (missing name -> 400)" $missingName.StatusCode 400

# ─── Bad timezone ────────────────────────────────────────────
$badTz = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name     = "Bad TZ Biz"
    timezone = "Not/A-Timezone"
}
Assert-Status "POST /businesses (bad timezone -> 400)" $badTz.StatusCode 400

# ─── List mine ───────────────────────────────────────────────
$list = Invoke-Api -Method GET -Path "/businesses/mine?limit=5" -Headers $auth
Assert-Status "GET /businesses/mine" $list.StatusCode 200

$listBadLimit = Invoke-Api -Method GET -Path "/businesses/mine?limit=0" -Headers $auth
Assert-Status "GET /businesses/mine (limit=0 -> 400)" $listBadLimit.StatusCode 400

$listBadCursor = Invoke-Api -Method GET -Path "/businesses/mine?cursor=invalid" -Headers $auth
Assert-Status "GET /businesses/mine (bad cursor -> 400)" $listBadCursor.StatusCode 400

# ─── Patch ───────────────────────────────────────────────────
$patch = Invoke-Api -Method PATCH -Path "/businesses/$($Global:Smoke.BusinessId)" -Headers $auth -Body @{
    slotGranularityMinutes = 30
}
Assert-Status "PATCH /businesses/:id" $patch.StatusCode 200

$emptyPatch = Invoke-Api -Method PATCH -Path "/businesses/$($Global:Smoke.BusinessId)" -Headers $auth -Body @{}
Assert-Status "PATCH /businesses/:id (empty body -> 400)" $emptyPatch.StatusCode 400

$badPatch = Invoke-Api -Method PATCH -Path "/businesses/$($Global:Smoke.BusinessId)" -Headers $auth -Body @{
    slotGranularityMinutes = 0
}
Assert-Status "PATCH /businesses/:id (granularity=0 -> 400)" $badPatch.StatusCode 400