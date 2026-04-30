Set-Location 'C:\Users\ASUS\Desktop\ai\ai-platform'
# Kill any previous dev server holding port 3000
$existing = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existing) {
  foreach ($c in $existing) {
    try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Seconds 2
}
$p = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c','npm run dev > dev.log 2>&1' `
  -WorkingDirectory 'C:\Users\ASUS\Desktop\ai\ai-platform' `
  -WindowStyle Hidden `
  -PassThru
$p.Id | Out-File -FilePath 'dev.pid' -Encoding ascii
Write-Host ("Started dev server, PID: {0}" -f $p.Id)
