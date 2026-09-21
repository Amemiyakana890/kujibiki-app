$port = 8080
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $root.TrimEnd('\') + '\'
$url  = "http://localhost:$port/index.html"

# ブラウザで案内ページを開く。
# サーバーが待ち受けを始めた「あと」で呼ぶので、起動直後に「接続が拒否されました」と出ることがない
# （以前は start.bat が固定の2秒を待ってから開いていたため、PowerShell の起動が遅いPCでは間に合わないことがあった）。
# ブラウザが開けなくても、サーバー自体は止めない。
function Open-Browser {
    try { Start-Process $url } catch { }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "ポート $port が使用中か、権限が不足しています。"
    Write-Host "他のサーバーが起動していないか確認してください。"
    # すでに起動済みのサーバーがある場合（二重起動）でも、ページを開けるようにする
    Open-Browser
    Read-Host "Enterキーで終了します"
    exit
}

Write-Host "抽選くじアプリ サーバーを起動しました。"
Write-Host "ブラウザが自動で開きます。開かない場合は、次のURLをブラウザで開いてください: $url"
Write-Host "終了するにはこのウィンドウを閉じてください。"
Write-Host ""

Open-Browser

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    $request  = $context.Request
    $response = $context.Response

    $path = $request.Url.LocalPath.TrimStart('/').Replace('/', '\')
    if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
    try {
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    } catch {
        $response.StatusCode = 400
        $msg = [System.Text.Encoding]::UTF8.GetBytes("400 Bad Request")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        $response.OutputStream.Close()
        continue
    }

    if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $msg = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        $response.OutputStream.Write($msg, 0, $msg.Length)
        $response.OutputStream.Close()
        continue
    }

    if (Test-Path $filePath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($ext) {
            ".html" { "text/html; charset=utf-8" }
            ".css"  { "text/css; charset=utf-8" }
            ".js"   { "application/javascript; charset=utf-8" }
            ".json" { "application/json; charset=utf-8" }
            ".png"  { "image/png" }
            ".jpg"  { "image/jpeg" }
            ".svg"  { "image/svg+xml" }
            default { "application/octet-stream" }
        }
        $response.ContentType = $contentType
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $response.OutputStream.Close()
}
