$ErrorActionPreference = 'Stop'
if (Test-Path 'C:\Program Files\Java\jdk-21\bin\java.exe') {
    $env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}
$configPath = Join-Path $PSScriptRoot '.env.local.ps1'
if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'Missing .env.local.ps1. Copy env.example.ps1 to .env.local.ps1 and set DB_USERNAME and DB_PASSWORD.'
}
. $configPath
# Some workstation environments set DEBUG globally, which makes Spring print a very large condition report.
$env:DEBUG = 'false'
if ([string]::IsNullOrWhiteSpace($env:DB_USERNAME) -or [string]::IsNullOrWhiteSpace($env:DB_PASSWORD) -or
    $env:DB_USERNAME.StartsWith('<') -or $env:DB_PASSWORD.StartsWith('<')) {
    throw 'DB_USERNAME or DB_PASSWORD is missing in .env.local.ps1.'
}
if ([string]::IsNullOrWhiteSpace($env:SPRING_PROFILES_ACTIVE)) { $env:SPRING_PROFILES_ACTIVE = 'dev' }
if ([string]::IsNullOrWhiteSpace($env:SERVER_PORT)) { $env:SERVER_PORT = '8081' }
if ([string]::IsNullOrWhiteSpace($env:DB_NAME)) { $env:DB_NAME = 'grammar_quest' }
if ($env:APP_SEED_DEMO -eq 'true' -and ([string]::IsNullOrWhiteSpace($env:DEMO_PASSWORD) -or $env:DEMO_PASSWORD.Length -lt 8)) {
    throw 'DEMO_PASSWORD must have at least 8 characters when APP_SEED_DEMO is true.'
}
& (Join-Path $PSScriptRoot 'mvnw.cmd') spring-boot:run
exit $LASTEXITCODE
