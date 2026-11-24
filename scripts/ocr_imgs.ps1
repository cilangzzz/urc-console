param()
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing

# --- WinRT bootstrap (PS 5.1) ---
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFolder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($WinRtOp, [Type]$ResultType) {
    $t = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($WinRtOp))
    $t.Wait(-1) | Out-Null
    $t.Result
}

function Get-Text([string]$path) {
    $img = [System.Drawing.Image]::FromFile($path)
    $w = $img.Width; $h = $img.Height; $img.Dispose()
    $use = $path
    if ([Math]::Max($w, $h) -gt 2400) {
        $scale = 2400.0 / [Math]::Max($w, $h)
        $nw = [int]($w * $scale); $nh = [int]($h * $scale)
        $src = [System.Drawing.Image]::FromFile($path)
        $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = 'HighQualityBicubic'
        $g.DrawImage($src, 0, 0, $nw, $nh)
        $g.Dispose()
        $use = Join-Path $env:TEMP ("ocr_" + [System.IO.Path]::GetFileNameWithoutExtension($path) + ".png")
        $bmp.Save($use, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose(); $src.Dispose()
    }
    $engine = $null
    foreach ($tag in @('zh-CN', 'en-US')) {
        try {
            $lang = New-Object Windows.Globalization.Language($tag)
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
            if ($engine) { break }
        } catch {}
    }
    if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
    if (-not $engine) { return '<no OCR engine>' }
    $folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync([System.IO.Path]::GetDirectoryName($use))) ([Windows.Storage.StorageFolder])
    $file = Await ($folder.GetFileAsync([System.IO.Path]::GetFileName($use))) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return $result.Text
}

foreach ($p in $args) {
    "=== $p ==="
    try {
        $txt = (Get-Text $p) -replace '\s+', ' '
        if ($txt.Length -gt 900) { $txt.Substring(0, 900) + ' …' } else { $txt }
    } catch { "OCR-FAIL: $($_.Exception.Message)" }
}
