# Mobile Bundle Script v2 - Forward Slash Safe
Add-Type -AssemblyName System.IO.Compression.FileSystem

$version = Get-Content -Raw version.json | ConvertFrom-Json | Select-Object -ExpandProperty version
$dest = "bundle.zip"
$wwwDir = "www"

# 1. Clear and Rebuild www directory
if (Test-Path $wwwDir) { Remove-Item -Recurse -Force $wwwDir }
New-Item -ItemType Directory -Path $wwwDir | Out-Null

Write-Host "Files are being prepared for v$version..." -ForegroundColor Blue

# 2. Copy Base Files
$mainFiles = @("index.html", "script.js", "style.css", "appConfig.js", "version.json", "about.txt")
foreach ($file in $mainFiles) {
    if (Test-Path $file) {
        Copy-Item $file "$wwwDir/$file"
        Write-Host "  Copied: $file" -ForegroundColor DarkGray
    }
}

# 3. Copy Folders (images/sounds)
$folders = @("images", "sounds")
foreach ($folder in $folders) {
    if (Test-Path $folder) {
        New-Item -ItemType Directory -Path "$wwwDir/$folder" -Force | Out-Null
        Copy-Item -Path "$folder/*" -Destination "$wwwDir/$folder" -Recurse -Force
        Write-Host "  Copied: $folder/ contents" -ForegroundColor DarkGray
    }
}

# 4. Create ZIP with FORWARD SLASHES (Cross-Platform compatible)
if (Test-Path $dest) { Remove-Item $dest }

Write-Host "Creating bundle.zip with forward slashes..." -ForegroundColor Blue

# Create an empty zip file first
$zipFile = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Create)

# Get all files in www recursively
$filesToZip = Get-ChildItem -Path $wwwDir -Recurse | Where-Object { -not $_.PSIsContainer }

foreach ($file in $filesToZip) {
    # Calculate relative path and replace \ with /
    $relativePath = $file.FullName.Substring((Get-Item $wwwDir).FullName.Length + 1).Replace("\", "/")
    
    # Create entry
    $entry = $zipFile.CreateEntry($relativePath)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($file.FullName)
    $fileStream.CopyTo($entryStream)
    
    $fileStream.Close()
    $entryStream.Close()
    Write-Host "  Zipped: $relativePath" -ForegroundColor Cyan
}

$zipFile.Dispose()

Write-Host ""
Write-Host "SUCCESS! bundle.zip created for v$version with / separators." -ForegroundColor Green
Write-Host "Please upload bundle.zip to GitHub Releases v$version tag." -ForegroundColor Yellow
