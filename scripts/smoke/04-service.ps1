#Requires -Version 5.1
#
# 04 — Service endpoints
# Covers: create, duplicate, bad duration/price/currency, list, get, patch.
# Populates: ServiceId.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "04. Service"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId
$locId    = $Global:Smoke.LocationId

if (-not $bizId -or -not $locId) {
    Write-Host "BusinessId/LocationId missing. Run 02/03 first." -ForegroundColor Red
    exit 1
}

$basePath = "/businesses/$bizId/locations/$locId/services"

# ─── Create ──────────────────────────────────────────────────
$create = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name            = "Haircut"
    durationMinutes = 30
    priceCents      = 15000
    currency        = "egp"
}
Assert-Status "POST /services (201)" $create.StatusCode 201

if ($create.StatusCode -ne 201) {
    Write-Host "Cannot continue without service id." -ForegroundColor Red
    exit 1
}

$Global:Smoke.ServiceId = $create.Body.data.id
Assert-True "Service id captured" ($null -ne $Global:Smoke.ServiceId)

# ─── Currency normalization ──────────────────────────────────
Assert-True "Currency normalized to EGP" ($create.Body.data.currency -eq "EGP")

# ─── Duplicate name ──────────────────────────────────────────
$dup = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name            = "Haircut"
    durationMinutes = 30
    priceCents      = 1000
}
Assert-Status "POST /services (duplicate -> 409)" $dup.StatusCode 409

# ─── Duration = 0 ────────────────────────────────────────────
$badDur = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name            = "Bad Duration"
    durationMinutes = 0
    priceCents      = 1000
}
Assert-Status "POST /services (duration=0 -> 400)" $badDur.StatusCode 400

# ─── Negative price ──────────────────────────────────────────
$badPrice = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name            = "Bad Price"
    durationMinutes = 30
    priceCents      = -1
}
Assert-Status "POST /services (negative price -> 400)" $badPrice.StatusCode 400

# ─── Bad currency ────────────────────────────────────────────
$badCurr = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name            = "Bad Currency"
    durationMinutes = 30
    priceCents      = 1000
    currency        = "US1"
}
Assert-Status "POST /services (bad currency -> 400)" $badCurr.StatusCode 400

# ─── Missing required ────────────────────────────────────────
$missing = Invoke-Api -Method POST -Path $basePath -Headers $auth -Body @{
    name = "Missing"
}
Assert-Status "POST /services (missing fields -> 400)" $missing.StatusCode 400

# ─── Customer role ───────────────────────────────────────────
$custTry = Invoke-Api -Method POST -Path $basePath -Headers $custAuth -Body @{
    name            = "Cust Svc"
    durationMinutes = 30
    priceCents      = 1000
}
Assert-Status "POST /services (customer -> 403)" $custTry.StatusCode 403

# ─── No auth ─────────────────────────────────────────────────
$noAuth = Invoke-Api -Method POST -Path $basePath -Body @{
    name            = "Anon"
    durationMinutes = 30
    priceCents      = 1000
}
Assert-Status "POST /services (no auth -> 401)" $noAuth.StatusCode 401

# ─── List ────────────────────────────────────────────────────
$list = Invoke-Api -Method GET -Path $basePath -Headers $auth
Assert-Status "GET /services" $list.StatusCode 200

$listLimit = Invoke-Api -Method GET -Path "${basePath}?limit=1" -Headers $auth
Assert-Status "GET /services?limit=1" $listLimit.StatusCode 200

$listBad = Invoke-Api -Method GET -Path "${basePath}?limit=101" -Headers $auth
Assert-Status "GET /services?limit=101 (-> 400)" $listBad.StatusCode 400

# ─── Get one ─────────────────────────────────────────────────
$svcId = $Global:Smoke.ServiceId

$get = Invoke-Api -Method GET -Path "$basePath/$svcId" -Headers $auth
Assert-Status "GET /services/:id" $get.StatusCode 200

$getUnknown = Invoke-Api -Method GET -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth
Assert-Status "GET /services/:id (unknown -> 404)" $getUnknown.StatusCode 404

$getBadUuid = Invoke-Api -Method GET -Path "$basePath/not-a-uuid" -Headers $auth
Assert-Status "GET /services/:id (bad uuid -> 400)" $getBadUuid.StatusCode 400

# ─── Patch ───────────────────────────────────────────────────
$patch = Invoke-Api -Method PATCH -Path "$basePath/$svcId" -Headers $auth -Body @{
    priceCents = 20000
}
Assert-Status "PATCH /services/:id (price)" $patch.StatusCode 200

$patchCurr = Invoke-Api -Method PATCH -Path "$basePath/$svcId" -Headers $auth -Body @{
    currency = "usd"
}
Assert-Status "PATCH /services/:id (currency normalized)" $patchCurr.StatusCode 200
Assert-True "PATCH normalized usd -> USD" ($patchCurr.Body.data.currency -eq "USD")

$patchEmpty = Invoke-Api -Method PATCH -Path "$basePath/$svcId" -Headers $auth -Body @{}
Assert-Status "PATCH /services/:id (empty body -> 400)" $patchEmpty.StatusCode 400

$patchUnknown = Invoke-Api -Method PATCH -Path "$basePath/00000000-0000-0000-0000-000000000000" -Headers $auth -Body @{
    priceCents = 500
}
Assert-Status "PATCH /services/:id (unknown -> 404)" $patchUnknown.StatusCode 404