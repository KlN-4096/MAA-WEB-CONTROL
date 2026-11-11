param(
    [string]$Python = "python",
    [string[]]$Tests = @("tests")
)
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..")
try {
    $env:PYTHONUTF8 = "1"
    & $Python -c "import subprocess,sys; sys.exit(subprocess.run([sys.executable,'-m','pytest',*sys.argv[1:],'-q','--tb=short'],timeout=60).returncode)" @Tests
    if ($LASTEXITCODE -ne 0) { throw "Verification failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
