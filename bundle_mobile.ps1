# Mobile Bundle Script
$version = Get-Content -Raw version.json | ConvertFrom-Json | Select-Object -ExpandProperty version
$dest = "bundle.zip"

if (Test-Path $dest) { Remove-Item $dest }

Write-Host "Zipping www folder for version $version..." -ForegroundColor Blue
Compress-Archive -Path www\* -DestinationPath $dest

Write-Host "Done! bundle.zip created." -ForegroundColor Green
Write-Host "Now upload bundle.zip to GitHub Releases under version v$version." -ForegroundColor Yellow
