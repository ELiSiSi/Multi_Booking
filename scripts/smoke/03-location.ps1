#Requires -Version 5.1
#
# 03 — Location endpoints
# Covers: create, duplicate, invalid TZ, list, get, patch, unknown.
# Populates: LocationId.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "03. Location"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId

if (-not $bizId) {
    Write-Host "BusinessId missing. Run 02-business.ps1 first." -ForegroundColor Red
    exit 1
}

# ─── Create ──────────────────────────────────────────────────
$create = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Headers $auth -Body @{
    name     = "Main Branch"
    address  = "123 Test St"
    timezone = "Africa/Cairo"
}
Assert-Status "POST /locations (201)" $create.StatusCode 201

if ($create.StatusCode -ne 201) {
    Write-Host "Cannot continue without location id." -ForegroundColor Red
    exit 1
}

$Global:Smoke.LocationId = $create.Body.data.id
Assert-True "Location id captured" ($null -ne $Global:Smoke.LocationId)

# ─── Duplicate name ──────────────────────────────────────────
$dup = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Headers $auth -Body @{
    name = "Main Branch"
}
Assert-Status "POST /locations (duplicate -> 409)" $dup.StatusCode 409

# ─── Empty name ──────────────────────────────────────────────
$empty = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Headers $auth -Body @{
    name = "   "
}
Assert-Status "POST /locations (empty name -> 400)" $empty.StatusCode 400

# ─── Invalid timezone ────────────────────────────────────────
$badTz = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Headers $auth -Body @{
    name     = "Bad TZ Branch"
    timezone = "Not/A-Timezone"
}
Assert-Status "POST /locations (invalid TZ -> 400)" $badTz.StatusCode 400

# ─── Customer role ───────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Headers $custAuth -Body @{
    name = "Customer Location"
}
Assert-Status "POST /locations (customer -> 403)" $custTry.StatusCode 403

# ─── No auth ─────────────────────────────────────────────────
$noAuth = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Body @{
    name = "Anon"
}
Assert-Status "POST /locations (no auth -> 401)" $noAuth.StatusCode 401

# ─── Unknown business ────────────────────────────────────────
$unknownBiz = Invoke-Api -Method POST -Path "/businesses/00000000-0000-0000-0000-000000000000/locations" -Headers $auth -Body @{
    name = "Ghost"
}
Assert-Status "POST /locations (unknown business -> 404)" $unknownBiz.StatusCode 404

# ─── List ────────────────────────────────────────────────────
$list = Invoke-Api -Method GET -Path "/businesses/$bizId/locations" -Headers $auth
Assert-Status "GET /locations" $list.StatusCode 200

$listLimit = Invoke-Api -Method GET -Path "/businesses/$bizId/locations?limit=1" -Headers $auth
Assert-Status "GET /locations?limit=1" $listLimit.StatusCode 200

$listBad = Invoke-Api -Method GET -Path "/businesses/$bizId/locations?limit=101" -Headers $auth
Assert-Status "GET /locations?limit=101 (-> 400)" $listBad.StatusCode 400

# ─── Get one ─────────────────────────────────────────────────
$locId = $Global:Smoke.LocationId

$get = Invoke-Api -Method GET -Path "/businesses/$bizId/locations/$locId" -Headers $auth
Assert-Status "GET /locations/:id" $get.StatusCode 200

$getUnknown = Invoke-Api -Method GET -Path "/businesses/$bizId/locations/00000000-0000-0000-0000-000000000000" -Headers $auth
Assert-Status "GET /locations/:id (unknown -> 404)" $getUnknown.StatusCode 404

$getBadUuid = Invoke-Api -Method GET -Path "/businesses/$bizId/locations/not-a-uuid" -Headers $auth
Assert-Status "GET /locations/:id (bad uuid -> 400)" $getBadUuid.StatusCode 400

# ─── Patch ───────────────────────────────────────────────────
$patch = Invoke-Api -Method PATCH -Path "/businesses/$bizId/locations/$locId" -Headers $auth -Body @{
    address = "456 New St"
}
Assert-Status "PATCH /locations/:id" $patch.StatusCode 200

$patchClear = Invoke-Api -Method PATCH -Path "/businesses/$bizId/locations/$locId" -Headers $auth -Body @{
    timezone = $null
}
Assert-Status "PATCH /locations/:id (clear timezone via null)" $patchClear.StatusCode 200

$patchEmpty = Invoke-Api -Method PATCH -Path "/businesses/$bizId/locations/$locId" -Headers $auth -Body @{}
Assert-Status "PATCH /locations/:id (empty body -> 400)" $patchEmpty.StatusCode 400

$patchUnknown = Invoke-Api -Method PATCH -Path "/businesses/$bizId/locations/00000000-0000-0000-0000-000000000000" -Headers $auth -Body @{
    name = "Ghost"
}
Assert-Status "PATCH /locations/:id (unknown -> 404)" $patchUnknown.StatusCode 404