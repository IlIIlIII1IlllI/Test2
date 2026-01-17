# Start-PaintByNumbers.ps1
# PowerShell alternative starter
# - switches Node via nvm
# - installs dependencies if missing
# - runs npm start and opens the browser

$ErrorActionPreference = 'Stop'

Write-Host "`n=== Paint-by-Numbers Generator: Local Start (PowerShell) ===`n"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Try to switch Node version
if (Get-Command nvm -ErrorAction SilentlyContinue) {
    Write-Host "[INFO] Using nvm to select Node v12.7.0 ..."
    & nvm use 12.7.0 | Out-Null
} else {
    Write-Host "[WARN] nvm not found in PATH. Continuing with current Node installation."
}

# Ensure node/npm are reachable
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if ($env:NVM_SYMLINK) {
        Write-Host "[INFO] node not found; adding NVM_SYMLINK to PATH: $($env:NVM_SYMLINK)"
        $env:Path = "$($env:NVM_SYMLINK);$($env:Path)"
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node not found. Please fix PATH or reopen the terminal."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm not found. Please fix PATH or reinstall Node/npm for this version."
}

# First-time install
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules not found - running npm install (first start only) ..."
    & npm install
}

$url = 'http://localhost:10001'
Write-Host "[INFO] Starting server (npm start) ..."
Write-Host "[INFO] Opening browser: $url"
Start-Process $url

Start-Sleep -Seconds 2
& npm start

Write-Host "[INFO] Server stopped."
Read-Host "Press Enter to close"
