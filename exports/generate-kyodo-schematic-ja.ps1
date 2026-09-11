# UTF-8 BOM. JOYFIT24経堂 概略図 — 2Fジム / 3Fホットスタジオ
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
$root = "C:\Users\r-kus\Github\renewal"
$outDir = Join-Path $root "drawings"
$labels = Get-Content (Join-Path $root "exports\schematic-labels.json") -Encoding UTF8 -Raw | ConvertFrom-Json

function New-F([float]$size, [bool]$bold=$false) {
  $style = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
  return New-Object Drawing.Font "Yu Gothic UI", $size, $style, ([Drawing.GraphicsUnit]::Pixel)
}
function RR($g,$pen,$brush,$x,$y,$w,$h,$r=16) {
  $p = New-Object Drawing.Drawing2D.GraphicsPath
  $d=$r*2
  $p.AddArc($x,$y,$d,$d,180,90); $p.AddArc($x+$w-$d,$y,$d,$d,270,90)
  $p.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90); $p.AddArc($x,$y+$h-$d,$d,$d,90,90)
  $p.CloseFigure()
  if ($brush) { $g.FillPath($brush,$p) }
  if ($pen) { $g.DrawPath($pen,$p) }
  $p.Dispose()
}
function Zone($g,$x,$y,$w,$h,$title,$sub,$fill,$stroke) {
  $b = New-Object Drawing.SolidBrush $fill
  $p = New-Object Drawing.Pen $stroke, 3
  RR $g $p $b $x $y $w $h 20
  $b.Dispose(); $p.Dispose()
  $tf = New-F 32 $true; $sf = New-F 18
  $tb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(30,30,35))
  $sb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(70,70,80))
  $g.DrawString($title,$tf,$tb,($x+18),($y+12))
  if ($sub) { $g.DrawString($sub,$sf,$sb,($x+18),($y+52)) }
  $tf.Dispose(); $sf.Dispose(); $tb.Dispose(); $sb.Dispose()
}
function Box($g,$x,$y,$w,$h,$label,$fill,$stroke) {
  $b = New-Object Drawing.SolidBrush $fill
  $p = New-Object Drawing.Pen $stroke, 2
  RR $g $p $b $x $y $w $h 8
  $b.Dispose(); $p.Dispose()
  $f = New-F 17 $true
  $ink = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(40,40,45))
  $fmt = New-Object Drawing.StringFormat
  $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
  $g.DrawString($label,$f,$ink,(New-Object Drawing.RectangleF $x,$y,$w,$h),$fmt)
  $f.Dispose(); $ink.Dispose(); $fmt.Dispose()
}

$W=3200; $H=2000; $m=80
$fx=$m; $fy=$m+70; $fw=$W-$m*2; $fh=$H-$m*2-90
$wall = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(40,40,45),10)
$ink = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(25,25,30))
$muted = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(100,100,110))
$hf = New-F 36 $true; $nf = New-F 18

# ---- 2F ジム（24時間）----
$bmp = New-Object Drawing.Bitmap $W,$H
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "ClearTypeGridFit"
$g.Clear([Drawing.Color]::FromArgb(245,246,248))
$g.DrawString($labels.title2,$hf,$ink,80,14)
$g.DrawString($labels.note2,$nf,$muted,80,56)
$g.DrawRectangle($wall,$fx,$fy,$fw,$fh)

# 有酸素（窓側）
Zone $g ($fx+40) ($fy+28) ($fw-80) 300 "有酸素エリア" "Run×13 / Synchro×4 / Bike系" ([Drawing.Color]::FromArgb(200,220,245)) ([Drawing.Color]::FromArgb(60,110,180))
$cx=$fx+70
1..13 | ForEach-Object { Box $g $cx ($fy+110) 70 170 "TM" ([Drawing.Color]::FromArgb(230,236,245)) ([Drawing.Color]::FromArgb(70,100,150)); $cx+=82 }
$cx+=16
1..4 | ForEach-Object { Box $g $cx ($fy+110) 70 170 "XT" ([Drawing.Color]::FromArgb(220,235,230)) ([Drawing.Color]::FromArgb(50,130,110)); $cx+=82 }
$cx+=16
1..3 | ForEach-Object { Box $g $cx ($fy+110) 70 170 "Bike" ([Drawing.Color]::FromArgb(235,230,245)) ([Drawing.Color]::FromArgb(110,80,160)); $cx+=82 }

# ロッカー・更衣室（左）
Zone $g ($fx+40) ($fy+360) 400 900 "更衣室・ロッカー" "シャワー／サウナ側" ([Drawing.Color]::FromArgb(235,235,238)) ([Drawing.Color]::FromArgb(110,110,120))
$ly=$fy+440
1..7 | ForEach-Object { Box $g ($fx+70) $ly 340 85 ("L"+$_) ([Drawing.Color]::FromArgb(250,250,252)) ([Drawing.Color]::FromArgb(140,140,150)); $ly+=95 }
Box $g ($fx+70) ($fy+1120) 340 100 "受付・入口寄り" ([Drawing.Color]::FromArgb(255,255,255)) ([Drawing.Color]::FromArgb(90,90,100))

# 通路
$aisle = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(220,222,228))
$g.FillRectangle($aisle,($fx+460),($fy+360),200,900); $aisle.Dispose()
$af = New-F 26 $true
$g.TranslateTransform(($fx+560),($fy+820)); $g.RotateTransform(-90)
$g.DrawString("通路",$af,$muted,0,0); $g.ResetTransform(); $af.Dispose()
$pillar = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(200,40,45))
$g.FillRectangle($pillar,($fx+690),($fy+680),60,60); $pillar.Dispose()
$pf = New-F 15; $g.DrawString("赤柱",$pf,$ink,($fx+688),($fy+748)); $pf.Dispose()

# レジスタンス
Zone $g ($fx+690) ($fy+360) 1050 500 "レジスタンス（Cybex）" "公式マシン一覧＋写真" ([Drawing.Color]::FromArgb(255,230,230)) ([Drawing.Color]::FromArgb(180,55,55))
$ms = @(
  @("レッグプレス",0,0),@("ショルダー",1,0),@("ペック",2,0),@("ラット",3,0),
  @("グルート",0,1),@("レッグEXT",1,1),@("レッグCURL",2,1),@("ヒップ",3,1),
  @("トルソー",0,2),@("チェスト",1,2),@("ローロー",2,2),@("アブ",3,2)
)
foreach ($m2 in $ms) {
  Box $g ($fx+720+[int]$m2[1]*245) ($fy+440+[int]$m2[2]*120) 225 100 $m2[0] ([Drawing.Color]::FromArgb(255,245,245)) ([Drawing.Color]::FromArgb(160,50,50))
}

# ストレッチ
Zone $g ($fx+690) ($fy+890) 1050 370 "ストレッチエリア" "公式5エリアの1つ" ([Drawing.Color]::FromArgb(250,245,230)) ([Drawing.Color]::FromArgb(160,130,60))

# フリーウェイト（右・地域最大級）
Zone $g ($fx+1780) ($fy+360) 1220 900 "フリーウェイト（地域最大級）" "ラック/スミス/ケーブル/DB" ([Drawing.Color]::FromArgb(235,245,230)) ([Drawing.Color]::FromArgb(70,130,70))
$fwItems = @(
  @("パワーラック×2",0,0,560,150),@("スミス×2〜3",580,0,560,150),
  @("ベンチプレス",0,170,270,130),@("インクライン",290,170,270,130),@("チンディップ",580,170,270,130),@("プリチャー",870,170,270,130),
  @("ケーブル/Bravo",0,320,370,130),@("DAP",390,320,370,130),@("ジャングル",780,320,360,130),
  @("45°レッグプレス",0,470,560,150),@("DBラック〜40kg",580,470,270,150),@("ベンチ類",870,470,270,150)
)
foreach ($f in $fwItems) {
  Box $g ($fx+1820+[int]$f[1]) ($fy+440+[int]$f[2]) ([int]$f[3]) ([int]$f[4]) $f[0] ([Drawing.Color]::FromArgb(245,252,240)) ([Drawing.Color]::FromArgb(60,110,60))
}

$g.DrawString("▲ 窓側",$nf,$muted,($fx+$fw/2-40),($fy+6))
$g.DrawString("▼ 入口・階段寄り",$nf,$muted,($fx+$fw/2-90),($fy+$fh-36))
$scale=[int]($fw*10/29)
$g.DrawLine((New-Object Drawing.Pen ([Drawing.Color]::Black),4),($fx+40),($H-40),($fx+40+$scale),($H-40))
$g.DrawString("約10m（概略スケール・配置用）",$nf,$ink,($fx+40),($H-72))
$path2 = Join-Path $outDir "経堂現状概略　2F.png"
$bmp.Save($path2,[Drawing.Imaging.ImageFormat]::Png)
Write-Host "wrote $path2"
$g.Dispose(); $bmp.Dispose()

# ---- 3F ホットスタジオ ----
$bmp = New-Object Drawing.Bitmap $W,$H
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "ClearTypeGridFit"
$g.Clear([Drawing.Color]::FromArgb(245,246,248))
$g.DrawString($labels.title3,$hf,$ink,80,14)
$g.DrawString($labels.note3,$nf,$muted,80,56)
$g.DrawRectangle($wall,$fx,$fy,$fw,$fh)

Zone $g ($fx+80) ($fy+60) ($fw-160) 1200 "3F ホットスタジオ" "有料オプション / 時間制限あり / 土足不可" ([Drawing.Color]::FromArgb(255,236,220)) ([Drawing.Color]::FromArgb(180,100,40))
Box $g ($fx+160) ($fy+200) 800 400 "レッスン床" ([Drawing.Color]::FromArgb(255,248,240)) ([Drawing.Color]::FromArgb(160,90,40))
Box $g ($fx+1040) ($fy+200) 700 400 "鏡・機材壁" ([Drawing.Color]::FromArgb(255,248,240)) ([Drawing.Color]::FromArgb(160,90,40))
Box $g ($fx+160) ($fy+660) 1580 200 "入口・廊下連絡" ([Drawing.Color]::FromArgb(245,245,248)) ([Drawing.Color]::FromArgb(120,120,130))
Box $g ($fx+160) ($fy+900) 500 250 "受付寄り" ([Drawing.Color]::FromArgb(245,245,248)) ([Drawing.Color]::FromArgb(120,120,130))
Box $g ($fx+720) ($fy+900) 1020 250 "マット置き・空き" ([Drawing.Color]::FromArgb(250,245,230)) ([Drawing.Color]::FromArgb(160,130,60))

Zone $g ($fx+80) ($fy+1320) ($fw-160) 280 "注記" "ジム本体マシンは2F。3Fはスタジオ用途が主。" ([Drawing.Color]::FromArgb(240,240,245)) ([Drawing.Color]::FromArgb(120,120,130))

$g.DrawString("▲ 奥",$nf,$muted,($fx+$fw/2-20),($fy+6))
$g.DrawString("▼ 階段・2F連絡",$nf,$muted,($fx+$fw/2-80),($fy+$fh-36))
$g.DrawLine((New-Object Drawing.Pen ([Drawing.Color]::Black),4),($fx+40),($H-40),($fx+40+$scale),($H-40))
$g.DrawString("約10m（概略スケール・配置用）",$nf,$ink,($fx+40),($H-72))
$path3 = Join-Path $outDir "経堂現状概略　3F.png"
$bmp.Save($path3,[Drawing.Imaging.ImageFormat]::Png)
Write-Host "wrote $path3"
$g.Dispose(); $bmp.Dispose()
$wall.Dispose(); $ink.Dispose(); $muted.Dispose(); $hf.Dispose(); $nf.Dispose()
Write-Host "done"
