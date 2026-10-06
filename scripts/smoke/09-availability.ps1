#Requires -Version 5.1
#
# 09 - Availability GET + cleanup
# Covers: Monday slots, bad date, unknown resource, cleanup of resources/rules/exceptions/assignments.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "09. Availability"

$auth     = $Global:Smoke.AdminAuth
$custAuth = $Global:Smoke.CustomerAuth
$bizId    = $Global:Smoke.BusinessId
$locId    = $Global:Smoke.LocationId
$svcId    = $Global:Smoke.ServiceId
$resId    = $Global:Smoke.ResourceId
$ruleId   = $Global:Smoke.RuleId
$excId    = $Global:Smoke.ExceptionId

if (-not $svcId -or -not $resId) {
    Write-Host "ServiceId/ResourceId missing." -ForegroundColor Red
    exit 1
}

$basePath = "/businesses/$bizId/locations/$locId/resources/$resId/services/$svcId/availability"

# Monday 2027-10-04 -> OPEN 09:00-17:00, BREAK 13:00-14:00, service 30m, gran 30m, buffer 0
$monday = Invoke-Api -Method GET -Path "${basePath}?date=2027-10-04"
Assert-Status "GET /availability (Monday)" $monday.StatusCode 200

if ($monday.StatusCode -eq 200) {
    $slots = $monday.Body.data.slots
    Write-Info "Slots returned: $($slots.Count)"
    Assert-True "Has at least 1 slot" ($slots.Count -ge 1)

    $firstStart = $slots[0].startAt
    Write-Info "First slot: $firstStart"
}

Assert-True "Response has timezone" ($null -ne $monday.Body.data.timezone)
Assert-True "Response has date" ($monday.Body.data.date -eq "2027-10-04")
Assert-True "Response has cached flag" ($null -ne $monday.Body.data.cached)

$second = Invoke-Api -Method GET -Path "${basePath}?date=2027-10-04"
Assert-Status "GET /availability (second call)" $second.StatusCode 200
Assert-True "Second call is cached" ($second.Body.data.cached -eq $true)

# Sunday 2027-10-10 has no recurring rules -> 0 slots
$sunday = Invoke-Api -Method GET -Path "${basePath}?date=2027-10-10"
Assert-Status "GET /availability (Sunday, no rules)" $sunday.StatusCode 200
Assert-True "Sunday has 0 slots" ($sunday.Body.data.slots.Count -eq 0)

$public = Invoke-Api -Method GET -Path "${basePath}?date=2027-10-04"
Assert-Status "GET /availability (public, no auth)" $public.StatusCode 200

$badDate = Invoke-Api -Method GET -Path "${basePath}?date=not-a-date"
Assert-Status "GET /availability (bad date -> 400)" $badDate.StatusCode 400

$missingDate = Invoke-Api -Method GET -Path $basePath
Assert-Status "GET /availability (missing date -> 400)" $missingDate.StatusCode 400

$unknownRes = Invoke-Api -Method GET -Path "/businesses/$bizId/locations/$locId/resources/00000000-0000-0000-0000-000000000000/services/$svcId/availability?date=2027-10-04"
Assert-Status "GET /availability (unknown resource -> 404)" $unknownRes.StatusCode 404

$unknownBiz = Invoke-Api -Method GET -Path "/businesses/00000000-0000-0000-0000-000000000000/locations/$locId/resources/$resId/services/$svcId/availability?date=2027-10-04"
Assert-Status "GET /availability (unknown business -> 404)" $unknownBiz.StatusCode 404

$badUuid = Invoke-Api -Method GET -Path "/businesses/$bizId/locations/$locId/resources/not-a-uuid/services/$svcId/availability?date=2027-10-04"
Assert-Status "GET /availability (bad uuid -> 400)" $badUuid.StatusCode 400

# =============================================================
# Cleanup - deletes everything created by the smoke suite
# =============================================================

Write-Section "09. Cleanup"

$unassignPath = "/businesses/$bizId/locations/$locId/services/$svcId/resources/$resId"

$unassign = Invoke-Api -Method DELETE -Path $unassignPath -Headers $auth
Assert-Status "DELETE assignment (204)" $unassign.StatusCode 204

$unassignAgain = Invoke-Api -Method DELETE -Path $unassignPath -Headers $auth
Assert-Status "DELETE assignment (again -> 404)" $unassignAgain.StatusCode 404

$ruleBase = "/businesses/$bizId/locations/$locId/resources/$resId/availability-rules"
$delRule = Invoke-Api -Method DELETE -Path "$ruleBase/$ruleId" -Headers $auth
Assert-Status "DELETE rule (204)" $delRule.StatusCode 204

$excBase = "/businesses/$bizId/locations/$locId/resources/$resId/availability-exceptions"
$delExc = Invoke-Api -Method DELETE -Path "$excBase/$excId" -Headers $auth
Assert-Status "DELETE exception (204)" $delExc.StatusCode 204

Write-Info "Business/Location/Service/Resource/User left in DB for manual inspection."
Write-Info "BusinessId:  $bizId"
Write-Info "LocationId:  $locId"
Write-Info "ServiceId:   $svcId"
Write-Info "ResourceId:  $resId"