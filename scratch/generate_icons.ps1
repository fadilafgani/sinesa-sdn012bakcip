Add-Type -AssemblyName System.Drawing

function Generate-Icon {
    param(
        [string]$Path,
        [int]$Size,
        [bool]$Maskable = $false
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    if ($Maskable) {
        # Maskable: draw full background with color #09090b
        $backColor = [System.Drawing.ColorTranslator]::FromHtml("#09090b")
        $g.Clear($backColor)

        # Draw a smaller blue/purple gradient circle inside (safe zone is 70% of size)
        $margin = $Size * 0.15
        $diameter = $Size * 0.70
        $rect = New-Object System.Drawing.RectangleF($margin, $margin, $diameter, $diameter)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $rect,
            [System.Drawing.ColorTranslator]::FromHtml("#2563eb"), # Blue
            [System.Drawing.ColorTranslator]::FromHtml("#7c3aed"), # Violet/Purple
            45.0
        )
        $g.FillEllipse($brush, $rect)
    } else {
        # Transparent background for standard icons
        $g.Clear([System.Drawing.Color]::Transparent)

        # Draw full size blue/purple gradient circle
        $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            $rect,
            [System.Drawing.ColorTranslator]::FromHtml("#2563eb"),
            [System.Drawing.ColorTranslator]::FromHtml("#7c3aed"),
            45.0
        )
        $g.FillEllipse($brush, $rect)
    }

    # Draw white letter "S" in Arial Black style
    $fontSize = $Size * 0.45
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $fontBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $textRect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    
    $g.DrawString("S", $font, $fontBrush, $textRect, $sf)

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated icon at $Path"
}

# Ensure public dir exists
if (!(Test-Path -Path "public")) {
    New-Item -ItemType Directory -Path "public"
}

Generate-Icon -Path "public/icon-192.png" -Size 192
Generate-Icon -Path "public/icon-512.png" -Size 512
Generate-Icon -Path "public/icon-maskable.png" -Size 512 -Maskable $true
