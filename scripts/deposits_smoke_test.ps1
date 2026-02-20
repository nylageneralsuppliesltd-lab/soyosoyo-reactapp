$ErrorActionPreference = 'Stop'
$base='http://localhost:3000/api'
$ts=[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')

$memberResp = Invoke-RestMethod -Uri "$base/members" -Method GET
$members = if ($memberResp -is [System.Array]) { $memberResp } elseif ($memberResp.data) { $memberResp.data } else { @() }
if (-not $members -or $members.Count -eq 0) { throw 'No members found for deposits smoke test' }
$member = $members[0]

$accResp = Invoke-RestMethod -Uri "$base/accounts/real/accounts" -Method GET
$accs = if ($accResp -is [System.Array]) { $accResp } elseif ($accResp.data) { $accResp.data } else { @() }
$accountId = if ($accs.Count -gt 0) { [int]$accs[0].id } else { $null }

$payloads = @(
  @{ date='2026-02-20'; memberName=$member.name; memberId=[int]$member.id; amount=101; paymentType='contribution'; contributionType='Monthly Contribution'; paymentMethod='cash'; accountId=$accountId; reference="QA-CON-$ts"; notes='QA contribution smoke' },
  @{ date='2026-02-20'; memberName=$member.name; memberId=[int]$member.id; amount=102; paymentType='fine'; fineType='late_payment'; reason='QA late payment'; paymentMethod='cash'; accountId=$accountId; reference="QA-FIN-$ts"; notes='QA fine smoke' },
  @{ date='2026-02-20'; memberName=$member.name; memberId=[int]$member.id; amount=103; paymentType='loan_repayment'; paymentMethod='cash'; accountId=$accountId; reference="QA-LOAN-$ts"; notes='QA loan repay smoke' },
  @{ date='2026-02-20'; memberName='External Source'; amount=104; paymentType='income'; paymentMethod='bank'; accountId=$accountId; reference="QA-INC-$ts"; notes='QA income smoke'; source='QA source' },
  @{ date='2026-02-20'; memberName=$member.name; memberId=[int]$member.id; amount=105; paymentType='miscellaneous'; paymentMethod='cash'; accountId=$accountId; reference="QA-MIS-$ts"; notes='QA misc smoke'; purpose='QA purpose' },
  @{ date='2026-02-20'; memberName=$member.name; memberId=[int]$member.id; amount=106; paymentType='share_capital'; paymentMethod='cash'; accountId=$accountId; reference="QA-SHR-$ts"; notes='QA share capital smoke' }
)

$results = @()
$created = @()

foreach ($p in $payloads) {
  try {
    $body = @{ payments = @($p) } | ConvertTo-Json -Depth 6
    $res = Invoke-RestMethod -Uri "$base/deposits/bulk/import-json" -Method POST -ContentType 'application/json' -Body $body
    $ok = ($res.successful -ge 1)
    if ($ok -and $res.createdIds) { $created += $res.createdIds }
    $results += [pscustomobject]@{ paymentType=$p.paymentType; status= if($ok){'PASS'} else {'FAIL'}; details = "successful=$($res.successful); failed=$($res.failed)" }
  } catch {
    $results += [pscustomobject]@{ paymentType=$p.paymentType; status='FAIL'; details=$_.Exception.Message }
  }
}

foreach ($id in $created) {
  try { Invoke-RestMethod -Uri "$base/deposits/$id" -Method DELETE | Out-Null } catch { }
}

Write-Output "CreatedAndCleanedIds: $($created -join ',')"
$results | Format-Table -AutoSize
