# Mobile Bundle Script - images/ ve sounds/ klasorlerini de dahil eder
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
    } else {
        Write-Host "  UYARI: $file bulunamadi!" -ForegroundColor Yellow
    }
}

# images/ klasoru
if (Test-Path "images") {
    Copy-Item -Recurse "images" "$wwwDir\images"
    Write-Host "  Kopyalandi: images/ klasoru" -ForegroundColor DarkGray
} else {
    Write-Host "  UYARI: images/ klasoru bulunamadi!" -ForegroundColor Yellow
}

# sounds/ klasoru
if (Test-Path "sounds") {
    Copy-Item -Recurse "sounds" "$wwwDir\sounds"
    Write-Host "  Kopyalandi: sounds/ klasoru" -ForegroundColor DarkGray
} else {
    Write-Host "  UYARI: sounds/ klasoru bulunamadi!" -ForegroundColor Yellow
}

# Eski bundle.zip'i sil ve yenisini olustur
if (Test-Path $dest) { Remove-Item $dest }

Write-Host "bundle.zip olusturuluyor..." -ForegroundColor Blue
Compress-Archive -Path "$wwwDir\*" -DestinationPath $dest

Write-Host ""
Write-Host "Tamamlandi! bundle.zip v$version icin olusturuldu." -ForegroundColor Green
Write-Host "Simdi GitHub Releases'e v$version etiketi altinda bundle.zip dosyasini yukleyin." -ForegroundColor Yellow
