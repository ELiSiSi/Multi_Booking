#Requires -Version 5.1
#
# Shared helpers for the smoke test suite.
# Dot-source this from each test file.
#

if (-not (Get-Variable -Name "Smoke" -Scope Global -ErrorAction SilentlyContinue)) {
    $Global:Smoke = @{
        BaseUrl        = "http://localhost:3001"
        AdminEmail     = "admin@reservio.local"
        AdminPassword  = "AdminPassword!123"

        Passed         = 0
        Failed         = 0
        Failures       = @()

        AdminToken     = $null
        AdminAuth      = @{}
        CustomerToken  = $null
        CustomerAuth   = @{}
        CustomerEmail  = $null

        BusinessId     = $null
        LocationId     = $null
        ServiceId      = $null
        ResourceId     = $null
        RuleId         = $null
        ExceptionId    = $null
    }
}

function Initialize-Smoke {
    param(
        [string]$BaseUrl = "http://localhost:3001",
        [string]$AdminEmail = "admin@reservio.local",
        [string]$AdminPassword = "AdminPassword!123"
    )
    $Global:Smoke.BaseUrl = $BaseUrl
    $Global:Smoke.AdminEmail = $AdminEmail
    $Global:Smoke.AdminPassword = $AdminPassword
}

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Text)
    Write-Host "  [INFO] $Text" -ForegroundColor Gray
}

function Assert-Status {
    param(
        [string]$Name,
        $Actual,
        $Expected
    )
    if ($Actual -eq $Expected) {
        Write-Host "  [OK]   $Name ($Actual)" -ForegroundColor Green
        $Global:Smoke.Passed++
    } else {
        Write-Host "  [FAIL] $Name (expected $Expected, got $Actual)" -ForegroundColor Red
        $Global:Smoke.Failed++
        $Global:Smoke.Failures += $Name
    }
}

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition
    )
    if ($Condition) {
        Write-Host "  [OK]   $Name" -ForegroundColor Green
        $Global:Smoke.Passed++
    } else {
        Write-Host "  [FAIL] $Name" -ForegroundColor Red
        $Global:Smoke.Failed++
        $Global:Smoke.Failures += $Name
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        $Body = $null
    )

    $uri = "$($Global:Smoke.BaseUrl)$Path"

    $params = @{
        Uri             = $uri
        Method          = $Method
        Headers         = $Headers
        UseBasicParsing = $true
        ErrorAction     = "Stop"
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
        $status = 0
        $content = $null

        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
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

function Print-SmokeSummary {
    Write-Section "Summary"

    Write-Host ""
    Write-Host "  Passed: $($Global:Smoke.Passed)" -ForegroundColor Green
    $failedColor = if ($Global:Smoke.Failed -gt 0) { "Red" } else { "Gray" }
    Write-Host "  Failed: $($Global:Smoke.Failed)" -ForegroundColor $failedColor

    if ($Global:Smoke.Failed -gt 0) {
        Write-Host ""
        Write-Host "  Failures:" -ForegroundColor Red
        foreach ($f in $Global:Smoke.Failures) {
            Write-Host "    - $f" -ForegroundColor Red
        }
        exit 1
    }

    Write-Host ""
    Write-Host "  All smoke checks passed!" -ForegroundColor Green
}