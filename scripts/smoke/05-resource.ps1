#Requires -Version 5.1
#
# 05 — Resource endpoints
# Covers: create, duplicate, negative buffer, list, get, patch.
# Populates: ResourceId.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "05. Resource"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId
$locId    = $Global:Smoke.LocationId

if (-not $bizId -or -not $locId) {
    Write-Host "BusinessId/LocationId missing. Run 02/03 first." -ForegroundColor Red
    exit 1
}

$basePath = "/businesses/$bizId/locations/$locId/resources"

# ─── Create ──────────────────────────────────────────────────
$create = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name          = "Ahmed"
    bufferMinutes = 5
}
Assert-Status "POST /resources (201)" $create.StatusCode 201

if ($create.StatusCode -ne 201) {
    Write-Host "Cannot continue without resource id." -ForegroundColor Red
    exit 1
}

$Global:Smoke.ResourceId = $create.Body.data.id
Assert-True "Resource id captured" ($null -ne $Global:Smoke.ResourceId)

# ─── Create without buffer (nullable) ────────────────────────
$createNoBuf = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name = "Mohamed"
}
Assert-Status "POST /resources (no buffer)" $createNoBuf.StatusCode 201

# ─── Duplicate name ──────────────────────────────────────────
$dup = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name = "Ahmed"
}
Assert-Status "POST /resources (duplicate -> 409)" $dup.StatusCode 409

# ─── Negative buffer ─────────────────────────────────────────
$badBuf = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name          = "Bad Buffer"
    bufferMinutes = -5
}
Assert-Status "POST /resources (negative buffer -> 400)" $badBuf.StatusCode 400

# ─── Empty name ──────────────────────────────────────────────
$empty = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name = "   "
}
Assert-Status "POST /resources (empty name -> 400)" $empty.StatusCode 400

# ─── Customer role ───────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path $basePath -Headers $custAuth -Body @{
    name = "Customer Resource"
}
Assert-Status "POST /resources (customer -> 403)" $custTry.StatusCode 403

# ─── No auth ─────────────────────────────────────────────────
$noAuth = Invoke-Api -Method POST -Path $basePath -Body @{ name = "Anon" }
Assert-Status "POST /resources (no auth -> 401)" $noAuth.StatusCode 401

# ─── List ────────────────────────────────────────────────────
$list = Invoke-Api -Method GET -Path $basePath -Headers $auth
Assert-Status "GET /resources" $list.StatusCode 200

$listLimit = Invoke-Api -Method GET -Path "${basePath}?limit=1" -Headers $auth
Assert-Status "GET /resources?limit=1" $listLimit.StatusCode 200

$listBad = Invoke-Api -Method GET -Path "${basePath}?limit=101" -Headers $auth
Assert-Status "GET /resources?limit=101 (-> 400)" $listBad.StatusCode 400

# ─── Get one ─────────────────────────────────────────────────
$resId = $Global:Smoke.ResourceId

$get = Invoke-Api -Method GET -Path "$basePath/$resId" -Headers $auth
Assert-Status "GET /resources/:id" $get.StatusCode 200

$getUnknown = Invoke-Api -Method GET -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth
Assert-Status "GET /resources/:id (unknown -> 404)" $getUnknown.StatusCode 404

$getBadUuid = Invoke-Api -Method GET -Path "$basePath/not-a-uuid" -Headers $auth
Assert-Status "GET /resources/:id (bad uuid -> 400)" $getBadUuid.StatusCode 400

# ─── Patch ───────────────────────────────────────────────────
$patch = Invoke-Api -Method PATCH -Path "$basePath/$resId" -Headers $auth -Body @{
    bufferMinutes = 10
}
Assert-Status "PATCH /resources/:id (buffer=10)" $patch.StatusCode 200
Assert-True "Buffer updated to 10" ($patch.Body.data.bufferMinutes -eq 10)

$patchClear = Invoke-Api -Method PATCH -Path "$basePath/$resId" -Headers $auth -Body @{
    bufferMinutes = $null
}
Assert-Status "PATCH /resources/:id (clear buffer)" $patchClear.StatusCode 200
Assert-True "Buffer cleared to null" ($null -eq $patchClear.Body.data.bufferMinutes)

$patchInactive = Invoke-Api -Method PATCH -Path "$basePath/$resId" -Headers $auth -Body @{
    isActive = $false
}
Assert-Status "PATCH /resources/:id (isActive=false)" $patchInactive.StatusCode 200

$patchActive = Invoke-Api -Method PATCH -Path "$basePath/$resId" -Headers $auth -Body @{
    isActive = $true
}
Assert-Status "PATCH /resources/:id (isActive=true)" $patchActive.StatusCode 200

$patchBadBuf = Invoke-Api -Method PATCH -Path "$basePath/$resId" -Headers $auth -Body @{
    bufferMinutes = -1
}
Assert-Status "PATCH /resources/:id (negative buffer -> 400)" $patchBadBuf.StatusCode 400

$patchEmpty = Invoke-Api -Method PATCH -Path "$basePath/$resId" -Headers $auth -Body @{}
Assert-Status "PATCH /resources/:id (empty body -> 400)" $patchEmpty.StatusCode 400

$patchUnknown = Invoke-Api -Method PATCH -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth -Body @{
    bufferMinutes = 5
}
Assert-Status "PATCH /resources/:id (unknown -> 404)" $patchUnknown.StatusCode 404