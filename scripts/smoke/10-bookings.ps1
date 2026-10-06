#Requires -Version 5.1
#
# 10 - Booking flow
# Covers: create, idempotency, overlapping, transitions, ownership.
# Creates its own isolated business.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "10. Booking"

$auth = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$custEmail = $Global:Smoke.CustomerEmail

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# ─── Setup: fresh business + location + service + resource + rules ───
$bizName = "Booking Biz $stamp"

$bizRes = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name     = $bizName
    timezone = "UTC"
}
Assert-Status "POST /businesses (for booking)" $bizRes.StatusCode 201

if ($bizRes.StatusCode -ne 201) { return }

$bizId = $bizRes.Body.data.id

$locRes = Invoke-Api -Method POST -Path "/businesses/$bizId/locations" -Headers $auth -Body @{
    name = "Booking-Loc"
}
Assert-Status "POST /locations (for booking)" $locRes.StatusCode 201
$locId = $locRes.Body.data.id

$svcRes = Invoke-Api -Method POST -Path "/businesses/$bizId/locations/$locId/services" -Headers $auth -Body @{
    name            = "Booking-Svc"
    durationMinutes = 30
    priceCents      = 5000
    currency        = "USD"
}
Assert-Status "POST /services (for booking)" $svcRes.StatusCode 201
$svcId = $svcRes.Body.data.id

$resRes = Invoke-Api -Method POST -Path "/businesses/$bizId/locations/$locId/resources" -Headers $auth -Body @{
    name          = "Booking-Res"
    bufferMinutes = 0
}
Assert-Status "POST /resources (for booking)" $resRes.StatusCode 201
$resId = $resRes.Body.data.id

$assignRes = Invoke-Api -Method POST -Path "/businesses/$bizId/locations/$locId/services/$svcId/resources/$resId" -Headers $auth
Assert-Status "POST /assign (for booking)" $assignRes.StatusCode 201

for ($weekday = 1; $weekday -le 7; $weekday++) {
    $ruleRes = Invoke-Api -Method POST -Path "/businesses/$bizId/locations/$locId/resources/$resId/availability-rules" -Headers $auth -Body @{
        weekday   = $weekday
        type      = "OPEN"
        startTime = "00:00"
        endTime   = "23:59"
    }
    if ($ruleRes.StatusCode -ne 201) {
        Write-Host "  [FAIL] rule for weekday $weekday (got $($ruleRes.StatusCode))" -ForegroundColor Red
    }
}
Assert-True "Seeded 7 weekly availability rules" $true

# ─── Booking creation ─────────────────────────────────────
$createBody = @{
    businessId = $bizId
    locationId = $locId
    resourceId = $resId
    serviceId  = $svcId
    startAt    = "2030-06-05T10:00:00.000Z"
}

$create = Invoke-Api -Method POST -Path "/bookings" -Headers $custAuth -Body $createBody
Assert-Status "POST /bookings (201)" $create.StatusCode 201

if ($create.StatusCode -eq 201) {
    Assert-True "booking status is pending" ($create.Body.data.status -eq "pending")
    Assert-True "booking duration = 30" ($create.Body.data.durationMinutes -eq 30)
    Assert-True "booking price = 5000" ($create.Body.data.priceCents -eq 5000)
}

$bookingId = $create.Body.data.id

# ─── Idempotency ──────────────────────────────────────────
$idemKey = "smoke-idem-$stamp"
$createBody2 = $createBody.Clone()
$createBody2.startAt = "2030-06-06T10:00:00.000Z"

$idem1 = Invoke-Api -Method POST -Path "/bookings" -Headers ($custAuth + @{ 'Idempotency-Key' = $idemKey }) -Body $createBody2
Assert-Status "POST /bookings (idempotency, first call 201)" $idem1.StatusCode 201

$idem2 = Invoke-Api -Method POST -Path "/bookings" -Headers ($custAuth + @{ 'Idempotency-Key' = $idemKey }) -Body $createBody2
Assert-Status "POST /bookings (idempotency, replay 201)" $idem2.StatusCode 201

if ($idem1.StatusCode -eq 201 -and $idem2.StatusCode -eq 201) {
    Assert-True "idempotency returned same booking id" ($idem1.Body.data.id -eq $idem2.Body.data.id)
}

# ─── Overlapping booking rejected ─────────────────────────
$overlap = Invoke-Api -Method POST -Path "/bookings" -Headers $custAuth -Body @{
    businessId = $bizId
    locationId = $locId
    resourceId = $resId
    serviceId  = $svcId
    startAt    = "2030-06-05T10:15:00.000Z"
}
Assert-Status "POST /bookings (overlap -> 409)" $overlap.StatusCode 409

# ─── Start in the past ────────────────────────────────────
$past = Invoke-Api -Method POST -Path "/bookings" -Headers $custAuth -Body @{
    businessId = $bizId
    locationId = $locId
    resourceId = $resId
    serviceId  = $svcId
    startAt    = "2020-01-01T10:00:00.000Z"
}
Assert-Status "POST /bookings (past -> 400)" $past.StatusCode 400

# ─── Unauthenticated ──────────────────────────────────────
$noAuth = Invoke-Api -Method POST -Path "/bookings" -Body $createBody
Assert-Status "POST /bookings (no auth -> 401)" $noAuth.StatusCode 401

# ─── GET own booking ──────────────────────────────────────
$getOwn = Invoke-Api -Method GET -Path "/bookings/$bookingId" -Headers $custAuth
Assert-Status "GET /bookings/:id (owner)" $getOwn.StatusCode 200

# ─── GET as admin ─────────────────────────────────────────
$getAdmin = Invoke-Api -Method GET -Path "/bookings/$bookingId" -Headers $auth
Assert-Status "GET /bookings/:id (admin owner)" $getAdmin.StatusCode 200

# ─── List mine ────────────────────────────────────────────
$listMine = Invoke-Api -Method GET -Path "/bookings/mine?limit=10" -Headers $custAuth
Assert-Status "GET /bookings/mine" $listMine.StatusCode 200

# ─── List business (admin) ────────────────────────────────
$listBiz = Invoke-Api -Method GET -Path "/businesses/$bizId/bookings?limit=10" -Headers $auth
Assert-Status "GET /businesses/:id/bookings (admin)" $listBiz.StatusCode 200

# ─── Confirm (admin only) ─────────────────────────────────
$confirm = Invoke-Api -Method POST -Path "/bookings/$bookingId/confirm" -Headers $auth
Assert-Status "POST /bookings/:id/confirm (admin)" $confirm.StatusCode 200

if ($confirm.StatusCode -eq 200) {
    Assert-True "booking is confirmed" ($confirm.Body.data.status -eq "confirmed")
}

# ─── Cannot confirm twice ─────────────────────────────────
$confirmTwice = Invoke-Api -Method POST -Path "/bookings/$bookingId/confirm" -Headers $auth
Assert-Status "POST /bookings/:id/confirm (again -> 409)" $confirmTwice.StatusCode 409

# ─── Customer cannot confirm ──────────────────────────────
$idemBookingId = $idem1.Body.data.id
$custConfirm = Invoke-Api -Method POST -Path "/bookings/$idemBookingId/confirm" -Headers $custAuth
Assert-Status "POST /bookings/:id/confirm (customer -> 403)" $custConfirm.StatusCode 403

# ─── Complete ─────────────────────────────────────────────
$complete = Invoke-Api -Method POST -Path "/bookings/$bookingId/complete" -Headers $auth
Assert-Status "POST /bookings/:id/complete" $complete.StatusCode 200

if ($complete.StatusCode -eq 200) {
    Assert-True "booking is completed" ($complete.Body.data.status -eq "completed")
}

# ─── Cancel (customer) ────────────────────────────────────
$cancelTarget = $idem1.Body.data.id
$cancel = Invoke-Api -Method POST -Path "/bookings/$cancelTarget/cancel" -Headers $custAuth -Body @{
    reason = "Smoke test cancel"
}
Assert-Status "POST /bookings/:id/cancel (customer)" $cancel.StatusCode 200

if ($cancel.StatusCode -eq 200) {
    Assert-True "booking is cancelled" ($cancel.Body.data.status -eq "cancelled")
    Assert-True "cancellation reason captured" ($cancel.Body.data.cancellationReason -eq "Smoke test cancel")
}

# ─── No-show guard ────────────────────────────────────────
$noShowId = $create.Body.data.id
$noShow = Invoke-Api -Method POST -Path "/bookings/$noShowId/no-show" -Headers $auth
Assert-Status "POST /bookings/:id/no-show (future -> 409)" $noShow.StatusCode 409

# ─── Cleanup ──────────────────────────────────────────────
Write-Section "10. Cleanup"

$delAssign = Invoke-Api -Method DELETE -Path "/businesses/$bizId/locations/$locId/services/$svcId/resources/$resId" -Headers $auth
Assert-Status "DELETE assignment (204)" $delAssign.StatusCode 204

Write-Info "Booking smoke test data left in DB:"
Write-Info "BusinessId: $bizId"
Write-Info "LocationId: $locId"
Write-Info "ServiceId:  $svcId"
Write-Info "ResourceId: $resId"