# Installs the prerequisites for running Supabase locally.
#
# MUST be run from an ELEVATED PowerShell (Run as administrator).
# Expect one reboot between stage 1 and stage 2.
#
#   Stage 1:  .\scripts\setup-docker.ps1        -> installs WSL2, then reboot
#   Stage 2:  .\scripts\setup-docker.ps1        -> installs Docker Desktop
#
# The script detects which stage is needed, so run the same command both times.

$ErrorActionPreference = 'Stop'

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "This script must be run as administrator." -ForegroundColor Red
        Write-Host "Right-click PowerShell -> Run as administrator, then re-run." -ForegroundColor Yellow
        exit 1
    }
}

function Test-Wsl2 {
    try {
        $null = wsl.exe --status 2>&1
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Test-Docker {
    return $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
}

Assert-Admin

Write-Host "`n=== NC Spark local backend setup ===`n" -ForegroundColor Cyan

# Virtualization must be on in firmware. Everything else is fixable from here.
if (-not (Get-CimInstance Win32_ComputerSystem).HypervisorPresent) {
    Write-Host "Hardware virtualization is disabled in firmware." -ForegroundColor Red
    Write-Host "Enable Intel VT-x / AMD-V in BIOS, then re-run this script." -ForegroundColor Yellow
    exit 1
}
Write-Host "[ok] hardware virtualization enabled"

# ---- Stage 1: WSL2 ----
if (-not (Test-Wsl2)) {
    Write-Host "`n[1/2] Installing WSL2 with Ubuntu. This downloads ~1 GB.`n" -ForegroundColor Cyan
    wsl.exe --install -d Ubuntu
    Write-Host "`n=====================================================" -ForegroundColor Green
    Write-Host " WSL2 installed. REBOOT NOW, then run this script again." -ForegroundColor Green
    Write-Host "=====================================================`n" -ForegroundColor Green
    exit 0
}
Write-Host "[ok] WSL2 present"

# ---- Stage 2: Docker Desktop ----
if (-not (Test-Docker)) {
    Write-Host "`n[2/2] Installing Docker Desktop. This downloads ~700 MB.`n" -ForegroundColor Cyan
    winget install --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements --silent
    Write-Host "`n=====================================================" -ForegroundColor Green
    Write-Host " Docker Desktop installed." -ForegroundColor Green
    Write-Host " 1. Launch Docker Desktop from the Start menu"
    Write-Host " 2. Accept the licence and wait for 'Engine running'"
    Write-Host " 3. Open a NEW terminal (PATH needs refreshing)"
    Write-Host " 4. Run:  npm run db:start"
    Write-Host "=====================================================`n" -ForegroundColor Green
    exit 0
}

Write-Host "[ok] Docker present: $((docker --version))"

try {
    $server = docker info --format '{{.ServerVersion}}'
    Write-Host "[ok] Docker engine running (v$server)"
    Write-Host "`nPrerequisites complete. Next:  npm run db:start`n" -ForegroundColor Green
} catch {
    Write-Host "`nDocker is installed but the engine is not running." -ForegroundColor Yellow
    Write-Host "Launch Docker Desktop, wait for 'Engine running', then: npm run db:start`n"
}
