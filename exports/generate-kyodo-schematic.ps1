# JOYFIT24経堂 — インドアビュー由来の概略図面（厳密寸法ではない）
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\drawings"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Font([string]$name, [float]$size, [Drawing.FontStyle]$style = [Drawing.FontStyle]::Regular) {
  return New-Object Drawing.Font $name, $size, $style, ([Drawing.GraphicsUnit]::Pixel)
}

function Draw-RoundRect($g, $pen, $brush, [int]$x, [int]$y, [int]$w, [int]$h, [int]$r = 18) {
  $path = New-Object Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  if ($brush) { $g.FillPath($brush, $path) }
  if ($pen) { $g.DrawPath($pen, $path) }
  $path.Dispose()
}

function Draw-MachineBlock($g, [int]$x, [int]$y, [int]$w, [int]$h, [string]$label, $fill, $stroke) {
  $brush = New-Object Drawing.SolidBrush $fill
  $pen = New-Object Drawing.Pen $stroke, 2
  Draw-RoundRect $g $pen $brush $x $y $w $h 10
  $brush.Dispose(); $pen.Dispose()
  $font = New-Font "Yu Gothic UI" 18 ([Drawing.FontStyle]::Bold)
  $sf = New-Object Drawing.StringFormat
  $sf.Alignment = [Drawing.StringAlignment]::Center
  $sf.LineAlignment = [Drawing.StringAlignment]::Center
  $tb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(40, 40, 45))
  $g.DrawString($label, $font, $tb, (New-Object Drawing.RectangleF $x, $y, $w, $h), $sf)
  $font.Dispose(); $tb.Dispose(); $sf.Dispose()
}

function Draw-Zone($g, [int]$x, [int]$y, [int]$w, [int]$h, [string]$title, [string]$sub, $fill, $stroke) {
  $brush = New-Object Drawing.SolidBrush $fill
  $pen = New-Object Drawing.Pen $stroke, 3
  Draw-RoundRect $g $pen $brush $x $y $w $h 22
  $brush.Dispose(); $pen.Dispose()
  $titleFont = New-Font "Yu Gothic UI" 36 ([Drawing.FontStyle]::Bold)
  $subFont = New-Font "Yu Gothic UI" 22
  $tb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(30, 30, 35))
  $sb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(70, 70, 80))
  $g.DrawString($title, $titleFont, $tb, ($x + 24), ($y + 18))
  if ($sub) { $g.DrawString($sub, $subFont, $sb, ($x + 24), ($y + 66)) }
  $titleFont.Dispose(); $subFont.Dispose(); $tb.Dispose(); $sb.Dispose()
}

function Save-Plan([string]$path, [Drawing.Bitmap]$bmp) {
  $bmp.Save($path, [Drawing.Imaging.ImageFormat]::Png)
  Write-Host "wrote $path ($($bmp.Width)x$($bmp.Height))"
}

# ---- 2F ----
# 想定外形: 幅約29m × 奥行約18m（経堂原本の planWidthMm / 面積から）
# 向き: 上=窓側（有酸素） / 下=階段・入口寄り / 左=ロッカー / 右=マシン・FW
$W = 3200; $H = 2000
$bmp2 = New-Object Drawing.Bitmap $W, $H
$g2 = [Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.TextRenderingHint = [Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g2.Clear([Drawing.Color]::FromArgb(245, 246, 248))

# outer wall
$wallPen = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(40, 40, 45), 10)
$margin = 80
$floorX = $margin; $floorY = $margin + 70
$floorW = $W - $margin * 2; $floorH = $H - $margin * 2 - 90
$g2.DrawRectangle($wallPen, $floorX, $floorY, $floorW, $floorH)

$headerFont = New-Font "Yu Gothic UI" 42 ([Drawing.FontStyle]::Bold)
$noteFont = New-Font "Yu Gothic UI" 20
$ink = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(25, 25, 30))
$muted = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(100, 100, 110))
$g2.DrawString("JOYFIT24 経堂 — 2F 現状概略図（インドアビュー推定）", $headerFont, $ink, 80, 18)
$g2.DrawString("厳密寸法ではない。配置検討用のたたき台。上=窓側 / 下=入口・階段寄り", $noteFont, $muted, 80, 62)

# Cardio (top / windows)
Draw-Zone $g2 ($floorX + 40) ($floorY + 30) ($floorW - 80) 320 "有酸素ゾーン" "Technogym Run×13 / Synchro×4 / Bike・Recline" `
  ([Drawing.Color]::FromArgb(200, 220, 245)) ([Drawing.Color]::FromArgb(60, 110, 180))
$cx = $floorX + 70
for ($i = 0; $i -lt 13; $i++) {
  Draw-MachineBlock $g2 $cx ($floorY + 120) 70 180 "TM" ([Drawing.Color]::FromArgb(230, 236, 245)) ([Drawing.Color]::FromArgb(70, 100, 150))
  $cx += 82
}
$cx += 20
for ($i = 0; $i -lt 4; $i++) {
  Draw-MachineBlock $g2 $cx ($floorY + 120) 70 180 "XT" ([Drawing.Color]::FromArgb(220, 235, 230)) ([Drawing.Color]::FromArgb(50, 130, 110))
  $cx += 82
}
$cx += 20
Draw-MachineBlock $g2 $cx ($floorY + 120) 70 180 "BK" ([Drawing.Color]::FromArgb(235, 230, 245)) ([Drawing.Color]::FromArgb(110, 80, 160))
$cx += 90
Draw-MachineBlock $g2 $cx ($floorY + 120) 70 180 "RC" ([Drawing.Color]::FromArgb(235, 230, 245)) ([Drawing.Color]::FromArgb(110, 80, 160))
$cx += 82
Draw-MachineBlock $g2 $cx ($floorY + 120) 70 180 "RC" ([Drawing.Color]::FromArgb(235, 230, 245)) ([Drawing.Color]::FromArgb(110, 80, 160))

# Lockers (left)
Draw-Zone $g2 ($floorX + 40) ($floorY + 380) 420 980 "ロッカー" "壁沿い列 + 受付机" `
  ([Drawing.Color]::FromArgb(235, 235, 238)) ([Drawing.Color]::FromArgb(110, 110, 120))
$ly = $floorY + 470
for ($r = 0; $r -lt 8; $r++) {
  Draw-MachineBlock $g2 ($floorX + 80) $ly 340 90 ("L" + ($r + 1)) ([Drawing.Color]::FromArgb(250, 250, 252)) ([Drawing.Color]::FromArgb(140, 140, 150))
  $ly += 100
}
Draw-MachineBlock $g2 ($floorX + 80) ($floorY + 1280) 340 60 "受付机" ([Drawing.Color]::FromArgb(255, 255, 255)) ([Drawing.Color]::FromArgb(90, 90, 100))

# Aisle
$aisleBrush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(220, 222, 228))
$g2.FillRectangle($aisleBrush, ($floorX + 480), ($floorY + 380), 220, 980)
$aisleBrush.Dispose()
$aisleFont = New-Font "Yu Gothic UI" 28 ([Drawing.FontStyle]::Bold)
$g2.TranslateTransform(($floorX + 590), ($floorY + 900))
$g2.RotateTransform(-90)
$g2.DrawString("通路", $aisleFont, $muted, 0, 0)
$g2.ResetTransform()
$aisleFont.Dispose()

# Red pillar landmark
$pillar = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(200, 40, 45))
$g2.FillRectangle($pillar, ($floorX + 720), ($floorY + 700), 70, 70)
$pillar.Dispose()
$pf = New-Font "Yu Gothic UI" 16
$g2.DrawString("赤柱", $pf, $ink, ($floorX + 720), ($floorY + 775))
$pf.Dispose()

# Resistance (center-right)
Draw-Zone $g2 ($floorX + 720) ($floorY + 380) 1100 520 "セレクタライズド（Cybex）" "Eagle NX / VR1 / Prestige ほか" `
  ([Drawing.Color]::FromArgb(255, 230, 230)) ([Drawing.Color]::FromArgb(180, 55, 55))
$machines = @(
  @("レッグプレス",0,0), @("ショルダー",1,0), @("ペック",2,0), @("ラット",3,0),
  @("グルート",0,1), @("レッグEXT",1,1), @("レッグCURL",2,1), @("ヒップ",3,1),
  @("トルソー",0,2), @("チェスト",1,2), @("ローロー",2,2), @("アブ",3,2)
)
foreach ($m in $machines) {
  $mx = $floorX + 760 + [int]$m[1] * 250
  $my = $floorY + 470 + [int]$m[2] * 130
  Draw-MachineBlock $g2 $mx $my 230 110 $m[0] ([Drawing.Color]::FromArgb(255, 245, 245)) ([Drawing.Color]::FromArgb(160, 50, 50))
}
Draw-MachineBlock $g2 ($floorX + 760) ($floorY + 860) 230 110 "シットアップ" ([Drawing.Color]::FromArgb(255, 245, 245)) ([Drawing.Color]::FromArgb(160, 50, 50))
Draw-MachineBlock $g2 ($floorX + 1010) ($floorY + 860) 230 110 "バックEXT" ([Drawing.Color]::FromArgb(255, 245, 245)) ([Drawing.Color]::FromArgb(160, 50, 50))

# Freeweight (right / bottom)
Draw-Zone $g2 ($floorX + 1860) ($floorY + 380) 1140 980 "フリーウェイト" "ラック / スミス / ケーブル / DB" `
  ([Drawing.Color]::FromArgb(235, 245, 230)) ([Drawing.Color]::FromArgb(70, 130, 70))
$fw = @(
  @("パワーラック×2", 0, 0, 520, 160),
  @("スミス×3", 540, 0, 520, 160),
  @("ベンチプレス", 0, 180, 250, 140),
  @("インクライン", 270, 180, 250, 140),
  @("チンディップ", 540, 180, 250, 140),
  @("プリチャー", 810, 180, 250, 140),
  @("Cybex Bravo", 0, 340, 340, 140),
  @("TG DAP", 360, 340, 340, 140),
  @("ジャングル", 720, 340, 340, 140),
  @("45°レッグプレス", 0, 500, 520, 160),
  @("DBラック", 540, 500, 250, 160),
  @("ベンチ×5", 810, 500, 250, 160)
)
foreach ($f in $fw) {
  Draw-MachineBlock $g2 ($floorX + 1900 + [int]$f[1]) ($floorY + 470 + [int]$f[2]) ([int]$f[3]) ([int]$f[4]) $f[0] `
    ([Drawing.Color]::FromArgb(245, 252, 240)) ([Drawing.Color]::FromArgb(60, 110, 60))
}

# Stretch / misc near bottom center
Draw-Zone $g2 ($floorX + 720) ($floorY + 940) 1100 420 "ストレッチ / 空き" "通路まわり・要現地確認" `
  ([Drawing.Color]::FromArgb(250, 245, 230)) ([Drawing.Color]::FromArgb(160, 130, 60))

# North label
$g2.DrawString("▲ 窓側（道路）", $noteFont, $muted, ($floorX + $floorW / 2 - 80), ($floorY + 8))
$g2.DrawString("▼ 入口・階段寄り", $noteFont, $muted, ($floorX + $floorW / 2 - 90), ($floorY + $floorH - 40))

# scale bar ~10m (assuming floorW ≈ 29m → 10m = floorW * 10/29)
$scaleLen = [int]($floorW * 10 / 29)
$g2.DrawLine((New-Object Drawing.Pen ([Drawing.Color]::Black), 4), ($floorX + 40), ($H - 40), ($floorX + 40 + $scaleLen), ($H - 40))
$g2.DrawString("約 10m（概略スケール）", $noteFont, $ink, ($floorX + 40), ($H - 70))

$path2 = Join-Path $outDir "経堂現状概略　2F.png"
Save-Plan $path2 $bmp2
$g2.Dispose(); $bmp2.Dispose()

# ---- 3F ----
$bmp3 = New-Object Drawing.Bitmap $W, $H
$g3 = [Drawing.Graphics]::FromImage($bmp3)
$g3.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g3.TextRenderingHint = [Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g3.Clear([Drawing.Color]::FromArgb(245, 246, 248))
$g3.DrawRectangle($wallPen, $floorX, $floorY, $floorW, $floorH)
$g3.DrawString("JOYFIT24 経堂 — 3F 現状概略図（インドアビュー推定）", $headerFont, $ink, 80, 18)
$g3.DrawString("厳密寸法ではない。廊下奥に男女ロッカー。トレーニング区画はフロアガイド＋写真から推定。", $noteFont, $muted, 80, 62)

# Corridor from bottom to locker rooms at top
$corrBrush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(225, 227, 232))
$g3.FillRectangle($corrBrush, ($floorX + 1200), ($floorY + 400), 640, 1100)
$corrBrush.Dispose()
$cf = New-Font "Yu Gothic UI" 30 ([Drawing.FontStyle]::Bold)
$g3.DrawString("廊下", $cf, $muted, ($floorX + 1420), ($floorY + 900))
$cf.Dispose()

# Locker rooms at far end
Draw-Zone $g3 ($floorX + 80) ($floorY + 40) 1450 340 "MEN'S Locker" "インドアビューで確認" `
  ([Drawing.Color]::FromArgb(220, 230, 245)) ([Drawing.Color]::FromArgb(60, 90, 150))
Draw-Zone $g3 ($floorX + 1600) ($floorY + 40) 1400 340 "WOMEN'S Locker" "インドアビューで確認" `
  ([Drawing.Color]::FromArgb(245, 225, 230)) ([Drawing.Color]::FromArgb(160, 60, 90))

# Info / mural wall left of corridor
Draw-Zone $g3 ($floorX + 80) ($floorY + 420) 1080 500 "壁面・案内" "壁画 / INFORMATION" `
  ([Drawing.Color]::FromArgb(240, 240, 245)) ([Drawing.Color]::FromArgb(120, 120, 130))

# Training / studio estimates
Draw-Zone $g3 ($floorX + 1880) ($floorY + 420) 1120 500 "スタジオ / プログラム想定" "フロアガイド上の別区画・要確認" `
  ([Drawing.Color]::FromArgb(255, 240, 220)) ([Drawing.Color]::FromArgb(180, 110, 40))
Draw-Zone $g3 ($floorX + 80) ($floorY + 960) 1080 560 "トレーニング区画（推定）" "3F利用範囲は営業時間制限の可能性あり" `
  ([Drawing.Color]::FromArgb(230, 245, 235)) ([Drawing.Color]::FromArgb(50, 120, 70))
Draw-Zone $g3 ($floorX + 1880) ($floorY + 960) 1120 560 "空き / ストレッチ想定" "現地で区画名を確認" `
  ([Drawing.Color]::FromArgb(250, 245, 230)) ([Drawing.Color]::FromArgb(160, 130, 60))

$g3.DrawString("▲ ロッカー側", $noteFont, $muted, ($floorX + $floorW / 2 - 60), ($floorY + 8))
$g3.DrawString("▼ 階段・2F連絡寄り", $noteFont, $muted, ($floorX + $floorW / 2 - 100), ($floorY + $floorH - 40))
$scaleLen = [int]($floorW * 10 / 29)
$g3.DrawLine((New-Object Drawing.Pen ([Drawing.Color]::Black), 4), ($floorX + 40), ($H - 40), ($floorX + 40 + $scaleLen), ($H - 40))
$g3.DrawString("約 10m（概略スケール）", $noteFont, $ink, ($floorX + 40), ($H - 70))

$path3 = Join-Path $outDir "経堂現状概略　3F.png"
Save-Plan $path3 $bmp3
$g3.Dispose(); $bmp3.Dispose()
$wallPen.Dispose()
$headerFont.Dispose(); $noteFont.Dispose(); $ink.Dispose(); $muted.Dispose()

Write-Host "done"
