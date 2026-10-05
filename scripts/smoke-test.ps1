#Requires -Version 5.1

param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$AdminEmail = "admin@reservio.local",
    [string]$AdminPassword = "AdminPassword!123"
)

$ErrorActionPreference = "Stop"
$script:Passed = 0
$script:Failed = 0
$script:Failures = @()

function Write-Header($text) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
}

function Write-Step($text) {
    Write-Host ""
    Write-Host "--> $text" -ForegroundColor Yellow
}

function Assert-Status($name, $actual, $expected) {
    if ($actual -eq $expected) {
        Write-Host "  [OK]   $name ($actual)" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  [FAIL] $name (expected $expected, got $actual)" -ForegroundColor Red
        $script:Failed++
        $script:Failures += $name
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        $Body = $null
    )

    $uri = "$BaseUrl$Path"

    $params = @{
        Uri              = $uri
        Method           = $Method
        Headers          = $Headers
        UseBasicParsing  = $true
        ErrorAction      = "Stop"
    }

    if ($null -ne $Body) {
        $params.Body        = ($Body | ConvertTo-Json -Compress -Depth 10)
        $params.ContentType = "application/json"
    } elseif ($Method -in @("POST", "PATCH", "PUT")) {
        $params.Body        = "{}"
        $params.ContentType = "application/json"
    }

    try {
        $response = Invoke-WebRequest @params
        $parsed = $null
        try { $parsed = $response.Content | ConvertFrom-Json } catch {}

        return @{
            StatusCode = [int]$response.StatusCode
            Body       = $parsed
            Raw        = $response.Content
        }
    } catch {
        $status  = 0
        $content = $null

        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader  = New-Object System.IO.StreamReader($stream)
                    $content = $reader.ReadToEnd()
                }
            } catch {}
        }

        $parsed = $null
        try { $parsed = $content | ConvertFrom-Json } catch {}

        return @{
            StatusCode = $status
            Body       = $parsed
            Raw        = $content
        }
    }
}

# -------------------------------------------------------------
# 0. Preflight
# -------------------------------------------------------------

Write-Header "Reservio API - Smoke Test"
Write-Host "  Base URL: $BaseUrl"
Write-Host "  Admin:    $AdminEmail"

Write-Step "Health check"
$health = Invoke-Api -Method GET -Path "/health"
Assert-Status "GET /health" $health.StatusCode 200

if ($health.StatusCode -ne 200) {
    Write-Host ""
    Write-Host "API is not reachable at $BaseUrl" -ForegroundColor Red
    Write-Host "Start it with: pnpm dev:api" -ForegroundColor Red
    exit 1
}

$ready = Invoke-Api -Method GET -Path "/ready"
Assert-Status "GET /ready" $ready.StatusCode 200

# -------------------------------------------------------------
# 1. Login
# -------------------------------------------------------------

Write-Header "1. Login"

$login = Invoke-Api -Method POST -Path "/api/v1/auth/login" -Body @{
    email    = $AdminEmail
    password = $AdminPassword
}

Assert-Status "POST /api/v1/auth/login" $login.StatusCode 200

if ($login.StatusCode -ne 200) {
    Write-Host ""
    Write-Host "Login failed. Did you run 'pnpm db:seed'?" -ForegroundColor Red
    exit 1
}

$token = $login.Body.accessToken
if (-not $token) {
    Write-Host "No accessToken in login response." -ForegroundColor Red
    exit 1
}

$auth = @{ Authorization = "Bearer $token" }
Write-Host "  [OK]   Got access token ($($token.Length) chars)" -ForegroundColor Green
$script:Passed++

# -------------------------------------------------------------
# 2. Business
# -------------------------------------------------------------

Write-Header "2. Business"

$stamp        = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$businessName = "Smoke Biz $stamp"

$createBiz = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name = $businessName
}
Assert-Status "POST /businesses" $createBiz.StatusCode 201

if ($createBiz.StatusCode -ne 201) { exit 1 }

$businessId = $createBiz.Body.data.id

$dupBiz = Invoke-Api -Method POST -Path "/businesses" -Headers $auth -Body @{
    name = $businessName
}
Assert-Status "POST /businesses (duplicate -> 409)" $dupBiz.StatusCode 409

$noAuthBiz = Invoke-Api -Method POST -Path "/businesses" -Body @{ name = "Anon" }
Assert-Status "POST /businesses (no auth -> 401)" $noAuthBiz.StatusCode 401

# -------------------------------------------------------------
# 3. Location
# -------------------------------------------------------------

Write-Header "3. Location"

$createLoc = Invoke-Api -Method POST -Path "/businesses/$businessId/locations" -Headers $auth -Body @{
    name    = "Main Branch"
    address = "123 Test St"
}
Assert-Status "POST /businesses/:id/locations" $createLoc.StatusCode 201

if ($createLoc.StatusCode -ne 201) { exit 1 }

$locationId = $createLoc.Body.data.id

$dupLoc = Invoke-Api -Method POST -Path "/businesses/$businessId/locations" -Headers $auth -Body @{
    name = "Main Branch"
}
Assert-Status "POST location (duplicate -> 409)" $dupLoc.StatusCode 409

$listLoc = Invoke-Api -Method GET -Path "/businesses/$businessId/locations" -Headers $auth
Assert-Status "GET /businesses/:id/locations" $listLoc.StatusCode 200

# -------------------------------------------------------------
# 4. Service
# -------------------------------------------------------------

Write-Header "4. Service"

$createSvc = Invoke-Api -Method POST -Path "/businesses/$businessId/locations/$locationId/services" -Headers $auth -Body @{
    name            = "Haircut"
    durationMinutes = 30
    priceCents      = 15000
    currency        = "egp"
}
Assert-Status "POST .../services" $createSvc.StatusCode 201

if ($createSvc.StatusCode -ne 201) { exit 1 }

$serviceId = $createSvc.Body.data.id
$returnedCurrency = $createSvc.Body.data.currency
if ($returnedCurrency -eq "EGP") {
    Write-Host "  [OK]   Currency normalized: egp -> $returnedCurrency" -ForegroundColor Green
    $script:Passed++
} else {
    Write-Host "  [FAIL] Currency normalization failed (got $returnedCurrency)" -ForegroundColor Red
    $script:Failed++
    $script:Failures += "currency normalization"
}

$badSvc = Invoke-Api -Method POST -Path "/businesses/$businessId/locations/$locationId/services" -Headers $auth -Body @{
    name            = "Bad"
    durationMinutes = 0
    priceCents      = 1000
}
Assert-Status "POST service (duration=0 -> 400)" $badSvc.StatusCode 400

# -------------------------------------------------------------
# 5. Resource
# -------------------------------------------------------------

Write-Header "5. Resource"

$createRes = Invoke-Api -Method POST -Path "/businesses/$businessId/locations/$locationId/resources" -Headers $auth -Body @{
    name          = "Ahmed"
    bufferMinutes = 5
}
Assert-Status "POST .../resources" $createRes.StatusCode 201

if ($createRes.StatusCode -ne 201) { exit 1 }

$resourceId = $createRes.Body.data.id

# -------------------------------------------------------------
# 6. Assignment
# -------------------------------------------------------------

Write-Header "6. Assignment"

$assign = Invoke-Api -Method POST -Path "/businesses/$businessId/locations/$locationId/services/$serviceId/resources/$resourceId" -Headers $auth
Assert-Status "POST assign resource" $assign.StatusCode 201

$dupAssign = Invoke-Api -Method POST -Path "/businesses/$businessId/locations/$locationId/services/$serviceId/resources/$resourceId" -Headers $auth
Assert-Status "POST assign (duplicate -> 409)" $dupAssign.StatusCode 409

$listAssign = Invoke-Api -Method GET -Path "/businesses/$businessId/locations/$locationId/services/$serviceId/resources" -Headers $auth
Assert-Status "GET .../services/:id/resources" $listAssign.StatusCode 200

# -------------------------------------------------------------
# 7. Pagination
# -------------------------------------------------------------

Write-Header "7. Pagination"

$listBiz = Invoke-Api -Method GET -Path "/businesses/mine?limit=1" -Headers $auth
Assert-Status "GET /businesses/mine?limit=1" $listBiz.StatusCode 200

$nextCursor = $listBiz.Body.meta.nextCursor
if ($nextCursor) {
    $listBiz2 = Invoke-Api -Method GET -Path "/businesses/mine?limit=1&cursor=$nextCursor" -Headers $auth
    Assert-Status "GET /businesses/mine?cursor=..." $listBiz2.StatusCode 200
}

$badCursor = Invoke-Api -Method GET -Path "/businesses/mine?cursor=invalid" -Headers $auth
Assert-Status "GET ...?cursor=invalid (-> 400)" $badCursor.StatusCode 400

# -------------------------------------------------------------
# 8. Unassign
# -------------------------------------------------------------

Write-Header "8. Unassign"

$unassign = Invoke-Api -Method DELETE -Path "/businesses/$businessId/locations/$locationId/services/$serviceId/resources/$resourceId" -Headers $auth
Assert-Status "DELETE assignment" $unassign.StatusCode 204

$unassignAgain = Invoke-Api -Method DELETE -Path "/businesses/$businessId/locations/$locationId/services/$serviceId/resources/$resourceId" -Headers $auth
Assert-Status "DELETE (already removed -> 404)" $unassignAgain.StatusCode 404

# -------------------------------------------------------------
# Summary
# -------------------------------------------------------------

Write-Header "Summary"

Write-Host ""
Write-Host "  Passed: $script:Passed" -ForegroundColor Green
Write-Host "  Failed: $script:Failed" -ForegroundColor $(if ($script:Failed -gt 0) { "Red" } else { "Gray" })

if ($script:Failed -gt 0) {
    Write-Host ""
    Write-Host "  Failures:" -ForegroundColor Red
    foreach ($f in $script:Failures) {
        Write-Host "    - $f" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "  All smoke checks passed!" -ForegroundColor Green
exit 0