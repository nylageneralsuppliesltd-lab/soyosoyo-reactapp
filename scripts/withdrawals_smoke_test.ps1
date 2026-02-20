$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000/api'
$ts = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')

$memberResp = Invoke-RestMethod -Uri "$base/members" -Method GET
$members = if ($memberResp -is [System.Array]) { $memberResp } elseif ($memberResp.data) { $memberResp.data } else { @() }
if (-not $members -or $members.Count -eq 0) { throw 'No members found for withdrawals smoke test' }
$member = $members[0]

$accountResp = $null
$accounts = @()
try {
  $accountResp = Invoke-RestMethod -Uri "$base/accounts/real/accounts" -Method GET
  $accounts = if ($accountResp -is [System.Array]) { $accountResp } elseif ($accountResp.data) { $accountResp.data } else { @() }
} catch {
  $accountResp = Invoke-RestMethod -Uri "$base/accounts" -Method GET
  $accounts = if ($accountResp -is [System.Array]) { $accountResp } elseif ($accountResp.data) { $accountResp.data } else { @() }
}
if (-not $accounts -or $accounts.Count -eq 0) { throw 'No accounts found for withdrawals smoke test' }
$accountId = [int]$accounts[0].id

$results = @()
$created = @()

# Expense
try {
  $payload = @{ date='2026-02-20'; amount=121; category='Office Supplies'; accountId=$accountId; paymentMethod='cash'; description='QA expense'; reference="QA-EXP-$ts"; notes='QA expense smoke' }
  $res = Invoke-RestMethod -Uri "$base/withdrawals/expense" -Method POST -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 6)
  if ($res.id) { $created += $res.id }
  $results += [pscustomobject]@{ withdrawalType='expense'; status='PASS'; details='created' }
} catch {
  $results += [pscustomobject]@{ withdrawalType='expense'; status='FAIL'; details=$_.Exception.Message }
}

# Refund
try {
  $payload = @{ date='2026-02-20'; memberId=[int]$member.id; memberName=$member.name; amount=122; contributionType='Monthly Contribution'; accountId=$accountId; paymentMethod='cash'; reference="QA-REF-$ts"; notes='QA refund smoke' }
  $res = Invoke-RestMethod -Uri "$base/withdrawals/refund" -Method POST -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 6)
  if ($res.id) { $created += $res.id }
  $results += [pscustomobject]@{ withdrawalType='refund'; status='PASS'; details='created' }
} catch {
  $results += [pscustomobject]@{ withdrawalType='refund'; status='FAIL'; details=$_.Exception.Message }
}

# Dividend
try {
  $payload = @{ date='2026-02-20'; memberId=[int]$member.id; memberName=$member.name; amount=123; accountId=$accountId; paymentMethod='bank'; reference="QA-DIV-$ts"; notes='QA dividend smoke' }
  $res = Invoke-RestMethod -Uri "$base/withdrawals/dividend" -Method POST -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 6)
  if ($res.id) { $created += $res.id }
  $results += [pscustomobject]@{ withdrawalType='dividend'; status='PASS'; details='created' }
} catch {
  $results += [pscustomobject]@{ withdrawalType='dividend'; status='FAIL'; details=$_.Exception.Message }
}

# Transfer
if ($accounts.Count -lt 2) {
  $results += [pscustomobject]@{ withdrawalType='transfer'; status='SKIP'; details='Need at least two accounts' }
} else {
  try {
    $fromAccountId = [int]$accounts[0].id
    $toAccountId = [int]$accounts[1].id
    $payload = @{ date='2026-02-20'; amount=124; fromAccountId=$fromAccountId; toAccountId=$toAccountId; description='QA transfer'; reference="QA-TRF-$ts"; notes='QA transfer smoke' }
    $res = Invoke-RestMethod -Uri "$base/withdrawals/transfer" -Method POST -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 6)
    if ($res.id) { $created += $res.id }
    $results += [pscustomobject]@{ withdrawalType='transfer'; status='PASS'; details='created' }
  } catch {
    $results += [pscustomobject]@{ withdrawalType='transfer'; status='FAIL'; details=$_.Exception.Message }
  }
}

foreach ($id in $created) {
  try { Invoke-RestMethod -Uri "$base/withdrawals/$id" -Method DELETE | Out-Null } catch { }
}

Write-Output "CreatedAndCleanedIds: $($created -join ',')"
$results | Format-Table -AutoSize
