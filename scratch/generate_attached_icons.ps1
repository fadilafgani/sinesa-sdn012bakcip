Add-Type -AssemblyName System.Drawing

function Generate-From-Attached {
    param(
        [string]$SrcPath,
        [string]$DestPath,
        [int]$Size,
        [bool]$Maskable = $false
    )

    $srcImg = [System.Drawing.Image]::FromFile($SrcPath)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($Maskable) {
        # Maskable: draw full background with color #09090b
        $backColor = [System.Drawing.ColorTranslator]::FromHtml("#09090b")
        $g.Clear($backColor)

        # Draw a smaller logo inside (safe zone is 70% of size)
        $margin = $Size * 0.15
        $destSize = $Size * 0.70
        $g.DrawImage($srcImg, $margin, $margin, $destSize, $destSize)
    } else {
        # Transparent background for standard icons
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($srcImg, 0, 0, $Size, $Size)
    }

    $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $srcImg.Dispose()
    Write-Host "Generated attached icon at $DestPath"
}

$attachedLogo = "C:\Users\Fadil Al Afgani\.gemini\antigravity-ide\brain\670287de-d1e1-4997-ba95-5deaf70d12fa\media__1784464417224.jpg"

Generate-From-Attached -SrcPath $attachedLogo -DestPath "public/icon-192.png" -Size 192
Generate-From-Attached -SrcPath $attachedLogo -DestPath "public/icon-512.png" -Size 512
Generate-From-Attached -SrcPath $attachedLogo -DestPath "public/icon-maskable.png" -Size 512 -Maskable $true
