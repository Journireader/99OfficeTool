param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$Query,
  [switch]$ExcludeBattleNew
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

function Text-From-Node($node) {
  if ($null -eq $node) { return '' }
  if ($node.GetType().Name -eq 'XmlElement') {
    if ($node.LocalName -eq 't') { return $node.InnerText }
    $parts = @()
    foreach ($ch in $node.ChildNodes) { $parts += Text-From-Node $ch }
    return ($parts -join '')
  }
  return [string]$node.Value
}

function Open-ZipShared($path) {
  $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  return [System.IO.Compression.ZipArchive]::new($fs, [System.IO.Compression.ZipArchiveMode]::Read, $false)
}

function Get-EntryText($zip, $name) {
  $e = $zip.GetEntry($name)
  if (!$e) { return $null }
  $sr = New-Object IO.StreamReader($e.Open())
  try { return $sr.ReadToEnd() } finally { $sr.Close() }
}

function Read-Xlsx($path) {
  $zip = Open-ZipShared $path
  try {
    $ss = @()
    $sst = Get-EntryText $zip 'xl/sharedStrings.xml'
    if ($sst) {
      [xml]$sx = $sst
      foreach ($si in $sx.sst.si) { $ss += (Text-From-Node $si) }
    }
    [xml]$wbxml = Get-EntryText $zip 'xl/workbook.xml'
    [xml]$relsxml = Get-EntryText $zip 'xl/_rels/workbook.xml.rels'
    $rels = @{}
    foreach ($r in $relsxml.Relationships.Relationship) { $rels[$r.Id] = [string]$r.Target }
    foreach ($sh in $wbxml.workbook.sheets.sheet) {
      $rid = $sh.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
      $target = $rels[$rid]
      if ($target -notmatch '^/') { $sheetPath = 'xl/' + $target.TrimStart('/') } else { $sheetPath = $target.TrimStart('/') }
      $sheetPath = $sheetPath -replace 'xl/worksheets/\.\./', 'xl/'
      $xml = Get-EntryText $zip $sheetPath
      if (!$xml) { continue }
      [xml]$x = $xml
      $rows = @()
      foreach ($row in $x.worksheet.sheetData.row) {
        $vals = @{}
        foreach ($c in $row.c) {
          $ref = [string]$c.r
          $col = ($ref -replace '\d', '')
          $v = [string]$c.v
          if ($c.t -eq 's' -and $v -ne '') { $v = $ss[[int]$v] }
          elseif ($c.t -eq 'inlineStr') { $v = Text-From-Node $c.is }
          $vals[$col] = $v
        }
        $rows += [pscustomobject]@{ R = [int]$row.r; C = $vals }
      }
      [pscustomobject]@{ Sheet = [string]$sh.name; Rows = $rows }
    }
  } finally {
    $zip.Dispose()
  }
}

function Val($row, $col) {
  if ($row -and $row.C.ContainsKey($col)) { return $row.C[$col] }
  return ''
}

function By-ColumnA($sheet, $id) {
  @($sheet.Rows | Where-Object { $_.R -ge 3 -and $_.C.ContainsKey('A') -and $_.C['A'] -eq [string]$id })
}

function Header-Map($sheet) {
  $h = @{}
  if ($sheet.Rows.Count -ge 2) {
    foreach ($kv in $sheet.Rows[1].C.GetEnumerator()) { $h[$kv.Value] = $kv.Name }
  }
  return $h
}

function Sheet-OrNull($book, $name) {
  $book | Where-Object Sheet -eq $name | Select-Object -First 1
}

function Read-Book($rel) {
  $path = Join-Path $Root $rel
  if (!(Test-Path -LiteralPath $path)) { return @() }
  Read-Xlsx $path
}

$enemyBook = Read-Book 'battle\Enemy.xlsx'
$roleResBook = Read-Book 'role\RoleRes.xlsx'
$skillBook = Read-Book 'battle\Skill.xlsx'
$directorBook = Read-Book 'battle\SkillDirector.xlsx'
$actionBook = Read-Book 'role\Action.xlsx'
$effectBook = Read-Book 'system\SpecialEffect.xlsx'
$buffBook = Read-Book 'battle\Buff.xlsx'

$enemy = Sheet-OrNull $enemyBook 'Enemy'
$monsterRes = Sheet-OrNull $roleResBook 'MonsterRes'
$skill = Sheet-OrNull $skillBook 'Skill'
$director = Sheet-OrNull $directorBook 'SkillDirector'
$action = Sheet-OrNull $actionBook 'Action'
$specialEffect = Sheet-OrNull $effectBook 'SpecialEffect'
$buff = Sheet-OrNull $buffBook 'Buff'

$issues = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

Write-Host "=== Candidate rows for query: $Query ==="
$candidateResIds = @()
foreach ($entry in @(
  @{Rel='battle\Enemy.xlsx'; Book=$enemyBook},
  @{Rel='role\RoleRes.xlsx'; Book=$roleResBook},
  @{Rel='battle\Skill.xlsx'; Book=$skillBook},
  @{Rel='battle\SkillDirector.xlsx'; Book=$directorBook},
  @{Rel='role\Action.xlsx'; Book=$actionBook},
  @{Rel='system\SpecialEffect.xlsx'; Book=$effectBook}
)) {
  foreach ($s in $entry.Book) {
    foreach ($r in $s.Rows | Where-Object { $_.R -ge 3 }) {
      $txt = $r.C.Values -join ' '
      if ($txt -like "*$Query*") {
        Write-Host ("{0} [{1}] row {2}: A={3} B={4} C={5} D={6}" -f $entry.Rel, $s.Sheet, $r.R, (Val $r 'A'), (Val $r 'B'), (Val $r 'C'), (Val $r 'D'))
        if ($s.Sheet -eq 'MonsterRes') { $candidateResIds += (Val $r 'A') }
        if ($s.Sheet -eq 'Enemy') { $candidateResIds += (Val $r 'D') }
      }
    }
  }
}

$candidateResIds = @($candidateResIds | Where-Object { $_ } | Select-Object -Unique)
if ($candidateResIds.Count -eq 0 -and $Query -match '^\d+$') { $candidateResIds = @($Query) }

foreach ($resId in $candidateResIds) {
  Write-Host "`n=== Trace MonsterRes $resId ==="
  $rr = (By-ColumnA $monsterRes $resId) | Select-Object -First 1
  if (!$rr) {
    $issues.Add("RoleRes MonsterResID $resId not found")
    continue
  }
  $enemyRows = @($enemy.Rows | Where-Object { $_.R -ge 3 -and $_.C.ContainsKey('D') -and $_.C['D'] -eq [string]$resId })
  if ($enemyRows.Count -eq 0) { $warnings.Add("No Enemy row references ResId $resId") }
  foreach ($er in $enemyRows) {
    Write-Host ("Enemy row {0}: EnemyId={1} desc={2} ai={3}/{4}" -f $er.R, (Val $er 'A'), (Val $er 'B'), (Val $er 'F'), (Val $er 'G'))
  }

  $skillIds = @()
  foreach ($col in @('N','O','P','Q','R','S','T','U','V')) {
    $v = Val $rr $col
    if ($v) { $skillIds += $v }
  }
  Write-Host ("MonsterRes row {0}: {1}; skills={2}" -f $rr.R, (Val $rr 'B'), ($skillIds -join ','))

  $triggerSheets = @('InstantTrigger','FollowTrigger','BulletTrigger','TrapTrigger','ThrowTrigger','SummonTrigger','RayTrigger')

  foreach ($sid in $skillIds) {
    $sk = (By-ColumnA $skill $sid) | Select-Object -First 1
    if (!$sk) {
      $issues.Add("SkillID $sid not found")
      continue
    }
    $did = Val $sk 'M'
    $dr = (By-ColumnA $director $did) | Select-Object -First 1
    if (!$dr) {
      $issues.Add("Skill $sid references missing SkillDirectorID $did")
      continue
    }
    $actId = Val $dr 'C'
    $act = (By-ColumnA $action $actId) | Select-Object -First 1
    if (!$act) { $issues.Add("Director $did references missing ActionID $actId") }
    Write-Host ("Skill {0} row {1}: {2}; cast={3}; director={4}; action={5}; actionTime={6}" -f $sid, $sk.R, (Val $sk 'B'), (Val $sk 'K'), $did, $actId, (Val $act 'C'))

    $header = Header-Map $director
    for ($i = 1; $i -le 12; $i++) {
      $typeCol = $header["LogicalTrigger#$i.Type"]
      $idCol = $header["LogicalTrigger#$i.TriggerID"]
      $effCol = $header["LogicalTrigger#$i.SkillEffects"]
      if (!$typeCol -or !$idCol) { continue }
      $type = Val $dr $typeCol
      $tid = Val $dr $idCol
      $effects = if ($effCol) { Val $dr $effCol } else { '' }
      if (!$type -and !$tid) { continue }
      if (!$type -or !$tid) {
        $issues.Add("Director $did has incomplete trigger #$i type=$type id=$tid")
        continue
      }
      $found = @()
      foreach ($candidateSheet in $triggerSheets) {
        $ts = Sheet-OrNull $directorBook $candidateSheet
        if (!$ts) { continue }
        $matches = By-ColumnA $ts $tid
        foreach ($m in $matches) {
          $found += [pscustomobject]@{ Sheet = $candidateSheet; Row = $m }
        }
      }
      if ($found.Count -eq 0) {
        $issues.Add("Director $did references trigger $type/$tid but no trigger sub-sheet has that TriggerID")
      } else {
        if ($found.Count -gt 1) {
          $warnings.Add("TriggerID $tid appears in multiple trigger sheets: $(($found | ForEach-Object { $_.Sheet }) -join ','); use logical trigger type to disambiguate")
        }
        $hit = $found[0]
        $tr = $hit.Row
        Write-Host ("  Trigger#{0}: {1}/{2} -> {3} row {4}; effects={5}; desc={6}" -f $i, $type, $tid, $hit.Sheet, $tr.R, $effects, (Val $tr 'B'))
        if ($hit.Sheet -eq 'ThrowTrigger') {
          foreach ($se in @((Val $tr 'I'), (Val $tr 'N')) -join ';' -split ';') {
            if ($se -like 'SpecialEffect_*') {
              $ser = (By-ColumnA $specialEffect $se) | Select-Object -First 1
              if (!$ser) { $issues.Add("ThrowTrigger $tid references missing SpecialEffect $se") }
              elseif ((Val $ser 'F') -like '*通用*') { $warnings.Add("Throw SpecialEffect $se uses generic hanging point $(Val $ser 'F'); verify it should mount on throw object") }
            }
          }
        }
      }
    }

    foreach ($triple in @(@('AD','AE','AF'),@('AK','AL','AM'),@('AR','AS','AT'))) {
      $etype = Val $sk $triple[1]
      $data = Val $sk $triple[2]
      if ($etype -like '*添加Buff*' -and $data) {
        $bid = ($data -split ',')[0]
        if ((By-ColumnA $buff $bid).Count -eq 0) { $issues.Add("Skill $sid references missing Buff $bid") }
      }
      if ($etype -like '*召唤怪物*' -and $data) {
        if ((By-ColumnA $enemy $data).Count -eq 0) { $issues.Add("Skill $sid summons missing EnemyID $data") }
      }
    }
  }
}

Write-Host "`n=== Issues ==="
if ($issues.Count -eq 0) { Write-Host "No hard missing-reference issues found." } else { $issues | Select-Object -Unique | ForEach-Object { Write-Host $_ } }

Write-Host "`n=== Warnings ==="
if ($warnings.Count -eq 0) { Write-Host "No warnings." } else { $warnings | Select-Object -Unique | ForEach-Object { Write-Host $_ } }
