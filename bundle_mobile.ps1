# Mobile Bundle Script v2.2 - Assembly Fix
try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
} catch {
    Write-Host "Warning: Could not load Compression assemblies via Add-Type. Trying alternative..." -ForegroundColor Yellow
}

$version = Get-Content -Raw version.json | ConvertFrom-Json | Select-Object -ExpandProperty version
$destName = "bundle.zip"
$wwwDir = "www"

$sourceRoot = (Get-Item .).FullName
$destPath = Join-Path $sourceRoot $destName
$wwwPath = Join-Path $sourceRoot $wwwDir

if (Test-Path $wwwPath) { Remove-Item -Recurse -Force $wwwPath }
New-Item -ItemType Directory -Path $wwwPath | Out-Null

Write-Host "Preparing v$version..." -ForegroundColor Blue

$mainFiles = @("index.html", "script.js", "style.css", "appConfig.js", "version.json", "about.txt", "changelog.json")
foreach ($file in $mainFiles) {
    $srcFile = Join-Path $sourceRoot $file
    if (Test-Path $srcFile) {
        Copy-Item $srcFile "$wwwPath/$file"
    }
}

$folders = @("images", "sounds")
foreach ($folder in $folders) {
    if (Test-Path $folder) {
        $targetFolder = Join-Path $wwwPath $folder
        New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
        Copy-Item -Path "$folder/*" -Destination $targetFolder -Recurse -Force
    }
}

if (Test-Path $destPath) { Remove-Item $destPath }

Write-Host "Creating bundle.zip with forward slashes..." -ForegroundColor Blue

try {
    # Use full type name to be safe
    $zipFile = [System.IO.Compression.ZipFile]::Open($destPath, [System.IO.Compression.ZipArchiveMode]::Create)
    $filesToZip = Get-ChildItem -Path $wwwPath -Recurse | Where-Object { -not $_.PSIsContainer }

    foreach ($file in $filesToZip) {
        $relativePath = $file.FullName.Substring($wwwPath.Length + 1).Replace("\", "/")
        $entry = $zipFile.CreateEntry($relativePath)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::OpenRead($file.FullName)
        $fileStream.CopyTo($entryStream)
        $fileStream.Close()
        $entryStream.Close()
        Write-Host "  + $relativePath" -ForegroundColor Cyan
    }

    $zipFile.Dispose()
    Write-Host "SUCCESS: $destPath" -ForegroundColor Green
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    if ($zipFile) { $zipFile.Dispose() }
}
