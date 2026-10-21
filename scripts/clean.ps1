[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$IncludeTestArtifacts)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'source/client/package.json')) -or
    -not (Test-Path -LiteralPath (Join-Path $projectRoot 'source/server/pom.xml'))) {
    throw 'Cannot identify project root. Nothing was removed.'
}

# Explicit generated paths only. Keep dependencies, local settings, source and database files.
$generatedPaths = @(
    'source/client/dist',
    'source/client/tsconfig.app.tsbuildinfo',
    'source/server/target',
    'source/server/review-tests.log',
    'source/server/capacity-roadmap-tests.log',
    'source/server/capacity-roadmap-full.log',
    'source/server/capacity-roadmap-final.log'
)
if ($IncludeTestArtifacts) { $generatedPaths += 'source/client/artifacts' }

foreach ($relativePath in $generatedPaths) {
    $targetPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relativePath))
    if (-not $targetPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing path outside project: $targetPath"
    }
    if (-not (Test-Path -LiteralPath $targetPath)) { continue }
    $item = Get-Item -LiteralPath $targetPath -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing linked target: $targetPath"
    }
    if ($PSCmdlet.ShouldProcess($targetPath, 'Remove generated build/test output')) {
        Remove-Item -LiteralPath $targetPath -Recurse -Force
        Write-Output "Removed: $relativePath"
    }
}
