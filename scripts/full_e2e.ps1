$ErrorActionPreference = 'Stop'

$root = 'c:\projects\soyosoyobank'
$frontendPort = 5173
$backendPort = 3000
$backendLog = Join-Path $env:TEMP 'soyosoyo_backend_e2e.log'
$backendErrLog = Join-Path $env:TEMP 'soyosoyo_backend_e2e.err.log'
$frontendLog = Join-Path $env:TEMP 'soyosoyo_frontend_e2e.log'
$frontendErrLog = Join-Path $env:TEMP 'soyosoyo_frontend_e2e.err.log'

function Stop-PortProcesses {
  param([int[]]$Ports)
  foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
      $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 120,
    [int[]]$AcceptStatus = @(200)
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 5
      if ($AcceptStatus -contains [int]$resp.StatusCode) {
        return $true
      }
    } catch {
      if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
        if ($AcceptStatus -contains $status) {
          return $true
        }
      }
    }
    Start-Sleep -Seconds 2
  }

  return $false
}

$backendProc = $null
$frontendProc = $null

try {
  Write-Output 'Cleaning ports 3000 and 5173-5176...'
  Stop-PortProcesses -Ports @(3000, 5173, 5174, 5175, 5176)

  if (Test-Path $backendLog) { Remove-Item $backendLog -Force -ErrorAction SilentlyContinue }
  if (Test-Path $backendErrLog) { Remove-Item $backendErrLog -Force -ErrorAction SilentlyContinue }
  if (Test-Path $frontendLog) { Remove-Item $frontendLog -Force -ErrorAction SilentlyContinue }
  if (Test-Path $frontendErrLog) { Remove-Item $frontendErrLog -Force -ErrorAction SilentlyContinue }

  Write-Output 'Starting backend...'
  $backendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'start:dev') -WorkingDirectory "$root\react-ui\backend" -PassThru -WindowStyle Hidden -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrLog

  Write-Output 'Starting frontend on 5173...'
  $frontendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--port', "$frontendPort", '--strictPort') -WorkingDirectory "$root\react-ui\frontend" -PassThru -WindowStyle Hidden -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrLog

  Write-Output 'Waiting for backend readiness...'
  $backendReady = Wait-ForHttp -Url "http://localhost:$backendPort/api/reports/catalog" -TimeoutSeconds 180 -AcceptStatus @(200,401)
  if (-not $backendReady) {
    if ($backendProc.HasExited) {
      Write-Output 'Backend process exited while waiting for readiness. Last backend logs:'
      if (Test-Path $backendLog) { Get-Content $backendLog -Tail 120 }
      if (Test-Path $backendErrLog) { Get-Content $backendErrLog -Tail 120 }
    }
    throw 'Backend did not become ready in time.'
  }

  Write-Output 'Waiting for frontend readiness...'
  $frontendReady = Wait-ForHttp -Url "http://localhost:$frontendPort" -TimeoutSeconds 180 -AcceptStatus @(200)
  if (-not $frontendReady) {
    if ($frontendProc.HasExited) {
      Write-Output 'Frontend process exited while waiting for readiness. Last frontend logs:'
      if (Test-Path $frontendLog) { Get-Content $frontendLog -Tail 120 }
      if (Test-Path $frontendErrLog) { Get-Content $frontendErrLog -Tail 120 }
    }
    throw 'Frontend did not become ready in time.'
  }

  Write-Output 'Running Cypress full suite...'
  Push-Location "$root\react-ui\frontend"
  npm run cypress:run
  $exitCode = $LASTEXITCODE
  Pop-Location

  if ($exitCode -ne 0) {
    throw "Cypress failed with exit code $exitCode"
  }

  Write-Output 'Full E2E suite passed.'
  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  Write-Output 'Cleaning up background servers...'
  if ($frontendProc -and -not $frontendProc.HasExited) {
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
  }
  Stop-PortProcesses -Ports @(3000, 5173, 5174, 5175, 5176)
}
