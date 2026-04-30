$urls = @('http://localhost:3000/','http://localhost:3000/login','http://localhost:3000/register','http://localhost:3000/chat','http://localhost:3000/dashboard')
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
    Write-Host ("OK  {0}  {1}  len={2}" -f $r.StatusCode, $u, $r.Content.Length)
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    Write-Host ("ERR {0}  {1}  {2}" -f $code, $u, $_.Exception.Message)
  }
}
