# Start the local server and create three demo accounts after database migrations.
$ErrorActionPreference = 'Stop'
$serverRoot = Join-Path $PSScriptRoot '../source/server'
$previousSeed = $env:APP_SEED_THREE_ACCOUNTS
$previousLegacySeed = $env:APP_SEED_DEMO
$previousProfile = $env:SPRING_PROFILES_ACTIVE
try {
    Push-Location -LiteralPath $serverRoot
    $configPath = Join-Path $serverRoot '.env.local.ps1'
    if (-not (Test-Path -LiteralPath $configPath)) {
        throw 'Copy source/server/env.example.ps1 to source/server/.env.local.ps1 and configure your database first.'
    }
    . $configPath
    $env:APP_SEED_THREE_ACCOUNTS = 'true'
    $env:APP_SEED_DEMO = 'false'
    $env:SPRING_PROFILES_ACTIVE = 'dev'
    if (Test-Path -LiteralPath 'C:/Program Files/Java/jdk-21/bin/java.exe') {
        $env:JAVA_HOME = 'C:/Program Files/Java/jdk-21'
        $env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
    }
    Write-Output 'Starting server. Demo accounts: admin1 / teacher1 / student1; password: 12345678.'
    Write-Output 'Existing accounts are preserved. Press Ctrl+C to stop the server.'
    & (Join-Path $serverRoot 'mvnw.cmd') spring-boot:run
    if ($LASTEXITCODE -ne 0) { throw "Server exited with code $LASTEXITCODE" }
} finally {
    $env:APP_SEED_THREE_ACCOUNTS = $previousSeed
    $env:APP_SEED_DEMO = $previousLegacySeed
    $env:SPRING_PROFILES_ACTIVE = $previousProfile
    Pop-Location
}
