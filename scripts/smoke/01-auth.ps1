#Requires -Version 5.1
#
# 01 — Auth endpoints
# Covers: login, register, me, logout.
# Populates: AdminToken, AdminAuth, CustomerToken, CustomerAuth, CustomerEmail.
#

. "$PSScriptRoot/_helpers.ps1"

Write-Section "01. Auth"

# ─── Admin login ────────────────────────────────────────────
$login = Invoke-Api -Method POST -Path "/api/v1/auth/login" -Body @{
    email    = $Global:Smoke.AdminEmail
    password = $Global:Smoke.AdminPassword
}
Assert-Status "POST /auth/login (admin)" $login.StatusCode 200

if ($login.StatusCode -ne 200) {
    Write-Host "Cannot continue without admin token." -ForegroundColor Red
    exit 1
}

$Global:Smoke.AdminToken = $login.Body.accessToken
$Global:Smoke.AdminAuth  = @{ Authorization = "Bearer $($Global:Smoke.AdminToken)" }
Assert-True "Admin token received" ($null -ne $Global:Smoke.AdminToken)

# ─── Register a new customer ─────────────────────────────────
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$customerEmail = "smoke-cust-$stamp@test.local"
$customerPass  = "CustomerPass!123"
$Global:Smoke.CustomerEmail = $customerEmail

$register = Invoke-Api -Method POST -Path "/api/v1/auth/register" -Body @{
    email    = $customerEmail
    password = $customerPass
    fullName = "Smoke Customer"
}
Assert-Status "POST /auth/register (customer)" $register.StatusCode 201

# ─── Duplicate register ──────────────────────────────────────
$dup = Invoke-Api -Method POST -Path "/api/v1/auth/register" -Body @{
    email    = $customerEmail
    password = $customerPass
    fullName = "Duplicate"
}
Assert-Status "POST /auth/register (duplicate -> 409)" $dup.StatusCode 409

# ─── Customer login ──────────────────────────────────────────
$loginC = Invoke-Api -Method POST -Path "/api/v1/auth/login" -Body @{
    email    = $customerEmail
    password = $customerPass
}
Assert-Status "POST /auth/login (customer)" $loginC.StatusCode 200

if ($loginC.StatusCode -eq 200) {
    $Global:Smoke.CustomerToken = $loginC.Body.accessToken
    $Global:Smoke.CustomerAuth  = @{ Authorization = "Bearer $($Global:Smoke.CustomerToken)" }
    Assert-True "Customer token received" ($null -ne $Global:Smoke.CustomerToken)
}

# ─── Wrong password ──────────────────────────────────────────
$badLogin = Invoke-Api -Method POST -Path "/api/v1/auth/login" -Body @{
    email    = $customerEmail
    password = "WrongPassword"
}
Assert-Status "POST /auth/login (wrong password -> 401)" $badLogin.StatusCode 401

# ─── Unknown email ───────────────────────────────────────────
$ghost = Invoke-Api -Method POST -Path "/api/v1/auth/login" -Body @{
    email    = "ghost-$stamp@test.local"
    password = "Whatever!123"
}
Assert-Status "POST /auth/login (unknown email -> 401)" $ghost.StatusCode 401

# ─── /auth/me ────────────────────────────────────────────────
$me = Invoke-Api -Method GET -Path "/api/v1/auth/me" -Headers $Global:Smoke.CustomerAuth
Assert-Status "GET /auth/me (customer)" $me.StatusCode 200

$meNoAuth = Invoke-Api -Method GET -Path "/api/v1/auth/me"
Assert-Status "GET /auth/me (no auth -> 401)" $meNoAuth.StatusCode 401

# ─── Logout (idempotent) ─────────────────────────────────────
$logout = Invoke-Api -Method POST -Path "/api/v1/auth/logout" -Headers $Global:Smoke.CustomerAuth
Assert-Status "POST /auth/logout" $logout.StatusCode 204

# Note: We intentionally do NOT log out the admin token,
# since it will be reused across the rest of the smoke suite.