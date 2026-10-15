$ErrorActionPreference = 'Stop'

foreach ($name in @('nsis-header', 'nsis-sidebar', 'wix-banner', 'wix-dialog')) {
    $source = Join-Path $PSScriptRoot "$name.svg"
    $bitmap = Join-Path $PSScriptRoot "$name.bmp"
    & magick -background white $source -alpha off -type TrueColor "BMP3:$bitmap"
    if ($LASTEXITCODE -ne 0) {
        throw "Could not render $source"
    }
}
