# capture_ui.ps1 — bring URC Console to front, click each tab via UIA, capture window PNGs
param([string]$OutDir = "f:\projects\urc\docs\images")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Add-Type -AssemblyName UIAutomationClient | Out-Null
Add-Type -AssemblyName UIAutomationTypes | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
[W32]::SetProcessDPIAware() | Out-Null

$proc = Get-Process urc-app | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "urc-app.exe not running" }
$hwnd = $proc.MainWindowHandle

function Get-WinRect([IntPtr]$h) {
    $r = New-Object W32+RECT
    # DWMWA_EXTENDED_FRAME_BOUNDS=9: true visible bounds without shadow
    [void][W32]::DwmGetWindowAttribute($h, 9, [ref]$r, [System.Runtime.InteropServices.Marshal]::SizeOf($r))
    return @{ x = $r.L; y = $r.T; w = $r.R - $r.L; h = $r.B - $r.T }
}

function Capture([string]$path, [IntPtr]$h) {
    [void][W32]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 600
    $r = Get-WinRect $h
    $bmp = New-Object System.Drawing.Bitmap($r.w, $r.h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($r.x, $r.y, 0, 0, (New-Object System.Drawing.Size($r.w, $r.h)))
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "saved $path ($($r.w)x$($r.h))"
}

function Click-Tab($winEl, [string]$name) {
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
    $btn = $winEl.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $btn) { Write-Host "UIA: tab '$name' not found"; return $false }
    try {
        $pat = $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $pat.Invoke()
        Write-Host "UIA invoked '$name'"
        return $true
    } catch {
        $r = $btn.Current.BoundingRectangle
        $cx = [int]($r.X + $r.Width / 2); $cy = [int]($r.Y + $r.Height / 2)
        [void][W32]::SetCursorPos($cx, $cy)
        Start-Sleep -Milliseconds 100
        [W32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)  # LEFTDOWN
        [W32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)  # LEFTUP
        Write-Host "mouse-clicked '$name' at ${cx},${cy}"
        return $true
    }
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty, [int]$hwnd)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $win) { throw "UIA: top-level window not found for hwnd=$hwnd" }

# current tab assumed 调音台 (startup default)
Capture (Join-Path $OutDir "ui-mix.png") $hwnd

foreach ($t in @(@("效果器", "ui-fx.png"), @("路由 / 系统", "ui-route.png"), @("调音台", "ui-mix.png"))) {
    if (Click-Tab $win $t[0]) {
        Start-Sleep -Milliseconds 900
        Capture (Join-Path $OutDir $t[1]) $hwnd
    }
}
Write-Host "done"
