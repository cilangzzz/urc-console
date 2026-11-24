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

function Get-Engine {
    foreach ($tag in @('zh-CN','en-US')) {
        try {
            $lang = New-Object Windows.Globalization.Language($tag)
            $e = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
            if ($e) { return $e }
        } catch {}
    }
    return [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}

# Crop: x,y,w,h in source pixels; scale up small crops for OCR accuracy
function Get-RegionText([string]$path, [int]$x, [int]$y, [int]$w, [int]$h, $engine, [double]$zoom = 3.0) {
    $src = [System.Drawing.Image]::FromFile($path)
    $sx = [Math]::Max(0, $x); $sy = [Math]::Max(0, $y)
    $sw = [Math]::Min($w, $src.Width - $sx); $sh = [Math]::Min($h, $src.Height - $sy)
    $nw = [int]($sw * $zoom); $nh = [int]($sh * $zoom)
    $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$nw,$nh)), (New-Object System.Drawing.Rectangle($sx,$sy,$sw,$sh)), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $src.Dispose()
    $tmp = Join-Path $env:TEMP ("ocrreg_" + [System.IO.Path]::GetFileNameWithoutExtension($path) + "_" + $x + "_" + $y + ".png")
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    $folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync([System.IO.Path]::GetDirectoryName($tmp))) ([Windows.Storage.StorageFolder])
    $file = Await ($folder.GetFileAsync([System.IO.Path]::GetFileName($tmp))) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    Remove-Item $tmp -ErrorAction SilentlyContinue | Out-Null
    # lines with coords relative to crop, mapped back to source coords
    $lines = @()
    foreach ($ln in $result.Lines) {
        $txt = $ln.Text
        # OcrLine has no BoundingRect; derive from word rects
        $minX = 1e9; $minY = 1e9; $maxX = 0; $maxY = 0
        foreach ($wd in $ln.Words) {
            $wr = $wd.BoundingRect
            if ($wr.X -lt $minX) { $minX = $wr.X }
            if ($wr.Y -lt $minY) { $minY = $wr.Y }
            if ($wr.X + $wr.Width -gt $maxX) { $maxX = $wr.X + $wr.Width }
            if ($wr.Y + $wr.Height -gt $maxY) { $maxY = $wr.Y + $wr.Height }
        }
        if ($minX -eq 1e9) { continue }
        $lx = [int]($sx + $minX / $zoom); $ly = [int]($sy + $minY / $zoom)
        $lw = [int](($maxX - $minX) / $zoom); $lh = [int](($maxY - $minY) / $zoom)
        $lines += "  [$lx,$ly ${lw}x${lh}] $txt"
    }
    return $lines
}

function Get-FullText([string]$path, $engine, [double]$zoom = 2.0) {
    $r0x = 0; $r0y = 0
    $src = [System.Drawing.Image]::FromFile($path)
    $w = $src.Width; $h = $src.Height; $src.Dispose()
    if ([Math]::Max($w,$h) -gt 3000) { $zoom = 1.0 }
    elseif ([Math]::Max($w,$h) -lt 1000) { $zoom = 4.0 }
    $nw = [int]($w * $zoom); $nh = [int]($h * $zoom)
    $src = [System.Drawing.Image]::FromFile($path)
    $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($src, 0, 0, $nw, $nh)
    $g.Dispose(); $src.Dispose()
    $tmp = Join-Path $env:TEMP ("ocrfull_" + [System.IO.Path]::GetFileNameWithoutExtension($path) + ".png")
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose(); $src.Dispose()

    $folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync([System.IO.Path]::GetDirectoryName($tmp))) ([Windows.Storage.StorageFolder])
    $file = Await ($folder.GetFileAsync([System.IO.Path]::GetFileName($tmp))) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    Remove-Item $tmp -ErrorAction SilentlyContinue | Out-Null
    $lines = @()
    foreach ($ln in $result.Lines) {
        $txt = $ln.Text
        $minX = 1e9; $minY = 1e9; $maxX = 0; $maxY = 0
        foreach ($wd in $ln.Words) {
            $wr = $wd.BoundingRect
            if ($wr.X -lt $minX) { $minX = $wr.X }
            if ($wr.Y -lt $minY) { $minY = $wr.Y }
            if ($wr.X + $wr.Width -gt $maxX) { $maxX = $wr.X + $wr.Width }
            if ($wr.Y + $wr.Height -gt $maxY) { $maxY = $wr.Y + $wr.Height }
        }
        if ($minX -eq 1e9) { continue }
        $lx = [int]($r0x + $minX / $zoom); $ly = [int]($r0y + $minY / $zoom)
        $lw = [int](($maxX - $minX) / $zoom); $lh = [int](($maxY - $minY) / $zoom)
        $lines += "  [$lx,$ly ${lw}x${lh}] $txt"
    }
    return $lines
}

# ---- FX region driver ----
$engine = Get-Engine
if (-not $engine) { Write-Output '<no OCR engine>'; exit 1 }
Write-Output ("OCR lang: " + $engine.RecognizerLanguage.LanguageTag)

# params: path then list of "name,x,y,w,h,zoom"
$p = $args[0]
$regions = $args[1..($args.Count-1)]
$img = [System.Drawing.Image]::FromFile($p)
"=== $p  ($($img.Width)x$($img.Height)) ==="
$img.Dispose()
foreach ($spec in $regions) {
    $parts = $spec -split ','
    $name = $parts[0]; $x=[int]$parts[1]; $y=[int]$parts[2]; $w=[int]$parts[3]; $h=[int]$parts[4]
    $zoom = if ($parts.Count -ge 6) { [double]$parts[5] } else { 3.0 }
    "--- region: $name [$x,$y ${w}x${h}] zoom=$zoom ---"
    try { (Get-RegionText $p $x $y $w $h $engine $zoom) | ForEach-Object { $_ } } catch { "OCR-FAIL: $($_.Exception.Message)" }
}
