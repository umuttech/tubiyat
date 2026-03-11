# Mobile Bundle Script - Guncellenmis ZIP stratejisi
$version = Get-Content -Raw version.json | ConvertFrom-Json | Select-Object -ExpandProperty version
$dest = "bundle.zip"
$wwwDir = "www"

# www klasorunu temizle ve yeniden olustur
if (Test-Path $wwwDir) { Remove-Item -Recurse -Force $wwwDir }
New-Item -ItemType Directory -Path $wwwDir | Out-Null

Write-Host "Dosyalar kopyalaniyor: v$version" -ForegroundColor Blue

# Ana dosyalar
$mainFiles = @("index.html", "script.js", "style.css", "appConfig.js", "version.json", "about.txt")
foreach ($file in $mainFiles) {
    if (Test-Path $file) {
        Copy-Item $file "$wwwDir\$file"
        Write-Host "  Kopyalandi: $file" -ForegroundColor DarkGray
    }
}

# Alt klasorleri kopyala (Daha saglam kopyalama yontemi)
if (Test-Path "images") {
    New-Item -ItemType Directory -Path "$wwwDir\images" -ErrorAction SilentlyContinue | Out-Null
    Copy-Item -Path "images\*" -Destination "$wwwDir\images" -Recurse -Force
    Write-Host "  Kopyalandi: images/ icerigi" -ForegroundColor DarkGray
}

if (Test-Path "sounds") {
    New-Item -ItemType Directory -Path "$wwwDir\sounds" -ErrorAction SilentlyContinue | Out-Null
    Copy-Item -Path "sounds\*" -Destination "$wwwDir\sounds" -Recurse -Force
    Write-Host "  Kopyalandi: sounds/ icerigi" -ForegroundColor DarkGray
}

# Eski bundle.zip'i sil
if (Test-Path $dest) { Remove-Item $dest }

# ZIP icinde klasor yapisini dogru kurmak icin www icine girip zipliyoruz
Write-Host "bundle.zip olusturuluyor..." -ForegroundColor Blue
Push-Location $wwwDir
# Alt klasorler dahil tum icerigi ziple
Compress-Archive -Path * -DestinationPath "..\$dest" -Force
Pop-Location

Write-Host ""
Write-Host "Basarili! bundle.zip v$version icin olusturuldu." -ForegroundColor Green
Write-Host "GitHub Releases v$version tagine yukleyin." -ForegroundColor Yellow
