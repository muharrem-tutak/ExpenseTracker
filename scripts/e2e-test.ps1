param([string]$BaseUrl = 'http://localhost:5011')
$ErrorActionPreference = 'Stop'
function Body($Response) { if ($Response.Content -is [byte[]]) { return [System.Text.Encoding]::UTF8.GetString($Response.Content) }; return $Response.Content }
function Check($Response, [int]$Status, [string]$Label) {
    if ([int]$Response.StatusCode -ne $Status) { throw "$Label expected $Status got $($Response.StatusCode): $(Body $Response)" }
    Write-Output "$Label HTTP $Status $(Body $Response)"
}
function Check-Row($Row, $Expected, [int]$Id) {
    if ($Row.id -ne $Id -or $Row.title -cne $Expected.title -or $Row.amount -ne $Expected.amount -or $Row.category -cne $Expected.category -or $Row.date -ne $Expected.date) { throw 'Response field mismatch' }
}
function Check-Sql([int]$Id, [string]$Condition, [int]$ExpectedCount) {
    $query = "SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.Expenses WHERE Id=$Id $Condition;"
    $result = & sqlcmd -S '(localdb)\MSSQLLocalDB' -E -d ExpenseTrackerPortfolio -b -h -1 -W -Q $query
    if ($LASTEXITCODE -ne 0) { throw "SQL query failed: $result" }
    if ([int](($result -join '').Trim()) -ne $ExpectedCount) { throw "SQL persistence mismatch: $result" }
    Write-Output "SQL verified: id=$Id matching rows=$ExpectedCount"
}
$original = @{title='E2E market';amount=125.75;category='Food';date='2026-10-01'}
$post = Invoke-WebRequest "$BaseUrl/api/expenses" -Method Post -ContentType 'application/json' -Body ($original | ConvertTo-Json)
Check $post 201 'POST'
$row = (Body $post) | ConvertFrom-Json
$id = [int]$row.id
if ($id -le 0) { throw 'Invalid generated ID' }
Check-Row $row $original $id
if (-not ([string]$post.Headers.Location).EndsWith("/api/expenses/$id")) { throw 'Invalid Location header' }
Check-Sql $id "AND Title=N'E2E market' AND Amount=125.75 AND Category=N'Food' AND Date='2026-10-01'" 1
$list = Invoke-WebRequest "$BaseUrl/api/expenses"
Check $list 200 'GET list'
$found = @((Body $list) | ConvertFrom-Json) | Where-Object id -eq $id
if (@($found).Count -ne 1) { throw 'List record mismatch' }
Check-Row $found $original $id
$get = Invoke-WebRequest "$BaseUrl/api/expenses/$id"
Check $get 200 'GET id'
Check-Row ((Body $get) | ConvertFrom-Json) $original $id
$updated = @{title='E2E updated';amount=200.50;category='Groceries';date='2026-09-30'}
$put = Invoke-WebRequest "$BaseUrl/api/expenses/$id" -Method Put -ContentType 'application/json' -Body ($updated | ConvertTo-Json)
Check $put 204 'PUT'
if (-not [string]::IsNullOrEmpty($put.Content)) { throw 'PUT body must be empty' }
$get = Invoke-WebRequest "$BaseUrl/api/expenses/$id"
Check $get 200 'GET updated'
Check-Row ((Body $get) | ConvertFrom-Json) $updated $id
Check-Sql $id "AND Title=N'E2E updated' AND Amount=200.50 AND Category=N'Groceries' AND Date='2026-09-30'" 1
$bad = Invoke-WebRequest "$BaseUrl/api/expenses" -Method Post -ContentType 'application/json' -Body '{"title":" ","amount":-1,"category":"","date":null}' -SkipHttpErrorCheck
Check $bad 400 'Invalid POST'
$problem = (Body $bad) | ConvertFrom-Json
if ($problem.status -ne 400 -or -not $problem.errors.Title -or -not $problem.errors.Amount -or -not $problem.errors.Category -or -not $problem.errors.Date) { throw 'Validation response mismatch' }
$precision = Invoke-WebRequest "$BaseUrl/api/expenses" -Method Post -ContentType 'application/json' -Body '{"title":"Test","amount":1.001,"category":"Test","date":"2026-10-01"}' -SkipHttpErrorCheck
Check $precision 400 'Invalid decimal POST'
if (-not ((Body $precision) | ConvertFrom-Json).errors.Amount) { throw 'Decimal validation response mismatch' }
$delete = Invoke-WebRequest "$BaseUrl/api/expenses/$id" -Method Delete
Check $delete 204 'DELETE'
if (-not [string]::IsNullOrEmpty($delete.Content)) { throw 'DELETE body must be empty' }
Check-Sql $id '' 0
$missing = Invoke-WebRequest "$BaseUrl/api/expenses/$id" -SkipHttpErrorCheck
Check $missing 404 'GET deleted'
if (((Body $missing) | ConvertFrom-Json).status -ne 404) { throw 'Not found problem mismatch' }
$listAfter = Invoke-WebRequest "$BaseUrl/api/expenses"
if ($id -in @((Body $listAfter) | ConvertFrom-Json).id) { throw 'Deleted record still listed' }
Write-Output 'PASS: all HTTP responses, fields, SQL insert/update/delete and validation verified.'
