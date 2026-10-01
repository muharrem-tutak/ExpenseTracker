param([string]$BaseUrl = 'http://localhost:5011')
$ErrorActionPreference = 'Stop'
function Assert-Status($Response, $Expected) {
    if ([int]$Response.StatusCode -ne $Expected) { throw "Expected $Expected, got $($Response.StatusCode): $($Response.Content)" }
}
$swagger = Invoke-WebRequest "$BaseUrl/swagger/v1/swagger.json"
Assert-Status $swagger 200
$body = @{title='Smoke test';amount=42.50;category='Test';date='2026-10-01'} | ConvertTo-Json
$created = Invoke-WebRequest "$BaseUrl/api/expenses" -Method Post -ContentType 'application/json' -Body $body
Assert-Status $created 201
$row = $created.Content | ConvertFrom-Json
$get = Invoke-RestMethod "$BaseUrl/api/expenses/$($row.id)"
if ($get.amount -ne 42.50) { throw 'Amount mismatch' }
$list = Invoke-RestMethod "$BaseUrl/api/expenses"
if ($row.id -notin $list.id) { throw 'List mismatch' }
$body = @{title='Updated test';amount=50;category='Test';date='2026-10-01'} | ConvertTo-Json
$put = Invoke-WebRequest "$BaseUrl/api/expenses/$($row.id)" -Method Put -ContentType 'application/json' -Body $body
Assert-Status $put 204
$updated = Invoke-RestMethod "$BaseUrl/api/expenses/$($row.id)"
if ($updated.title -ne 'Updated test' -or $updated.amount -ne 50) { throw 'Update mismatch' }
$bad = Invoke-WebRequest "$BaseUrl/api/expenses" -Method Post -ContentType 'application/json' -Body '{"title":" ","amount":-1,"category":"","date":null}' -SkipHttpErrorCheck
Assert-Status $bad 400
$precision = Invoke-WebRequest "$BaseUrl/api/expenses" -Method Post -ContentType 'application/json' -Body '{"title":"Test","amount":1.001,"category":"Test","date":"2026-10-01"}' -SkipHttpErrorCheck
Assert-Status $precision 400
$delete = Invoke-WebRequest "$BaseUrl/api/expenses/$($row.id)" -Method Delete
Assert-Status $delete 204
$missing = Invoke-WebRequest "$BaseUrl/api/expenses/$($row.id)" -SkipHttpErrorCheck
Assert-Status $missing 404
Write-Output 'PASS: Swagger, create, list, get, update, validation, decimal precision, delete, not found.'
