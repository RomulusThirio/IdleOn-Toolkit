param([string]$GamePath = '', [switch]$Restore, [switch]$NoPrompt)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$hook = 'q._customBlock_Teleport=function(e){'
$patchStart = '/* Injected inside the installed game'

function Resolve-GamePath {
    if ($GamePath) { return (Resolve-Path -LiteralPath $GamePath).Path }
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    $candidates.Add((Get-Location).Path)
    $candidates.Add((Split-Path -Parent $PSScriptRoot))
    $steam = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
    if (!$steam) { $steam = Join-Path ${env:ProgramFiles(x86)} 'Steam' }
    $libraries = @($steam)
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
        foreach ($match in [regex]::Matches([IO.File]::ReadAllText($vdf), '"path"\s+"([^"]+)"')) {
            $libraries += $match.Groups[1].Value.Replace('\\', '\')
        }
    }
    foreach ($library in $libraries) { $candidates.Add((Join-Path $library 'steamapps\common\Legends of Idleon')) }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'resources\app.asar')) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    if ($NoPrompt) { throw 'IdleOn was not found. Supply -GamePath with its installation folder.' }
    $chosen = (Read-Host 'Paste your IdleOn installation folder (Steam > Properties > Installed Files > Browse)').Trim('"')
    if (!$chosen) { throw 'No game folder selected.' }
    return (Resolve-Path -LiteralPath $chosen).Path
}

function Get-Hash([byte[]]$Bytes, [int]$Offset = 0, [int]$Count = -1) {
    if ($Count -lt 0) { $Count = $Bytes.Length - $Offset }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes, $Offset, $Count))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Read-Archive([byte[]]$Bytes) {
    if ($Bytes.Length -lt 16 -or [BitConverter]::ToUInt32($Bytes, 0) -ne 4) { throw 'Invalid ASAR archive.' }
    $length = [BitConverter]::ToUInt32($Bytes, 12)
    $start = 8 + [long][BitConverter]::ToUInt32($Bytes, 4)
    if ($length -gt $Bytes.Length - 16 -or $start -gt $Bytes.Length -or $start -lt 16 + $length) { throw 'Invalid ASAR header size.' }
    $header = $utf8.GetString($Bytes, 16, $length) | ConvertFrom-Json
    $leaves = New-Object 'System.Collections.Generic.List[object]'
    function Visit($Node, [string]$Prefix) {
        foreach ($property in $Node.files.PSObject.Properties) {
            $entry = $property.Value
            $path = $Prefix + '/' + $property.Name
            if ($entry.files) { Visit $entry $path }
            elseif (!$entry.unpacked -and $null -ne $entry.offset) {
                $offset = $start + [long]$entry.offset
                if ($offset -lt $start -or $entry.size -lt 0 -or $offset + $entry.size -gt $Bytes.Length) { throw "Invalid file bounds: $path" }
                $leaves.Add([pscustomobject]@{ Path = $path; Entry = $entry; Offset = [int]$offset; Size = [int]$entry.size })
            }
        }
    }
    Visit $header ''
    $target = $leaves | Where-Object { $_.Path -eq '/distBuild/static/game/N.js' }
    if (!$target) { throw 'IdleOn game script not found in this archive.' }
    return [pscustomobject]@{ Bytes = $Bytes; Header = $header; Leaves = $leaves; Target = $target }
}

function Build-Archive($Archive, [byte[]]$ScriptBytes) {
    $offset = 0L
    foreach ($leaf in $Archive.Leaves) {
        $leaf.Entry.offset = [string]$offset
        if ($leaf.Path -eq $Archive.Target.Path) {
            $leaf.Entry.size = $ScriptBytes.Length
            if ($leaf.Entry.integrity) {
                $blockSize = [int]$leaf.Entry.integrity.blockSize
                if ($blockSize -le 0) { $blockSize = 4194304 }
                $hashes = @()
                for ($i = 0; $i -lt $ScriptBytes.Length; $i += $blockSize) {
                    $hashes += Get-Hash $ScriptBytes $i ([Math]::Min($blockSize, $ScriptBytes.Length - $i))
                }
                $leaf.Entry.integrity = [pscustomobject]@{ algorithm='SHA256'; hash=(Get-Hash $ScriptBytes); blockSize=$blockSize; blocks=$hashes }
            }
        }
        $offset += $leaf.Entry.size
    }
    $json = $utf8.GetBytes(($Archive.Header | ConvertTo-Json -Depth 100 -Compress))
    $padding = (4 - $json.Length % 4) % 4
    $memory = New-Object IO.MemoryStream
    $writer = New-Object IO.BinaryWriter($memory)
    try {
        $writer.Write([uint32]4)
        $writer.Write([uint32](8 + $json.Length + $padding))
        $writer.Write([uint32](4 + $json.Length + $padding))
        $writer.Write([uint32]$json.Length)
        $writer.Write($json)
        $writer.Write((New-Object byte[] $padding))
        foreach ($leaf in $Archive.Leaves) {
            if ($leaf.Path -eq $Archive.Target.Path) { $writer.Write($ScriptBytes) }
            else { $writer.Write($Archive.Bytes, $leaf.Offset, $leaf.Size) }
        }
        $output = $memory.ToArray()
    } finally { $writer.Dispose(); $memory.Dispose() }
    $check = Read-Archive $output
    if ($check.Leaves.Count -ne $Archive.Leaves.Count) { throw 'Archive file count verification failed.' }
    for ($i = 0; $i -lt $Archive.Leaves.Count; $i++) {
        $before = $Archive.Leaves[$i]; $after = $check.Leaves[$i]
        if ($before.Path -ne $after.Path) { throw 'Archive file ordering verification failed.' }
        $expected = if ($before.Path -eq $Archive.Target.Path) { Get-Hash $ScriptBytes } else { Get-Hash $Archive.Bytes $before.Offset $before.Size }
        if ((Get-Hash $output $after.Offset $after.Size) -ne $expected) { throw "Archive verification failed: $($after.Path)" }
    }
    return ,$output
}

try {
    $game = Resolve-GamePath
    $archivePath = Join-Path $game 'resources\app.asar'
    if (!(Test-Path -LiteralPath $archivePath)) { throw 'The selected folder does not contain resources\app.asar.' }
    if (Get-Process -Name 'LegendsOfIdleon' -ErrorAction SilentlyContinue) { throw 'Close IdleOn completely, then run this launcher again.' }
    $stateDir = Join-Path $game 'idleon-toolkit-backups'
    $legacyState = Join-Path $game 'rom-travel-backups'
    if (!(Test-Path -LiteralPath $stateDir) -and (Test-Path -LiteralPath $legacyState)) { $stateDir = $legacyState }
    $statePath = Join-Path $stateDir 'installed.json'
    $current = [IO.File]::ReadAllBytes($archivePath)
    $currentHash = Get-Hash $current
    if ($Restore) {
        if (!(Test-Path -LiteralPath $statePath)) { throw 'No backup record from this installer. Use your previous restore tool or Steam Verify integrity.' }
        $state = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
        if ($state.installedHash -ne $currentHash) { throw 'Game files changed since installation. Restore refused; use Steam Verify integrity for the current game version.' }
        if ($state.backupHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid backup record.' }
        $backup = Join-Path $stateDir ($state.backupHash + '.asar')
        $restored = [IO.File]::ReadAllBytes($backup)
        if ((Get-Hash $restored) -ne $state.backupHash) { throw 'Backup verification failed.' }
        $output = $restored
    } else {
        $archive = Read-Archive $current
        $source = $utf8.GetString($current, $archive.Target.Offset, $archive.Target.Size)
        if ($source.Contains('window.__romNavigation')) {
            $begin = $source.IndexOf($patchStart)
            $end = if ($begin -ge 0) { $source.IndexOf($hook, $begin) } else { -1 }
            if ($begin -lt 0 -or $end -le $begin -or $source.IndexOf($patchStart, $begin + 1) -ge 0) { throw 'Existing menu patch is not recognized. Restore the original game before installing.' }
            $source = $source.Substring(0, $begin) + $source.Substring($end)
        }
        if ([regex]::Matches($source, [regex]::Escape($hook)).Count -ne 1) { throw 'This game build is incompatible: expected travel function was not found exactly once.' }
        $menuPath = Join-Path $PSScriptRoot 'menu.js'
        $menu = [IO.File]::ReadAllText($menuPath, $utf8).Trim()
        if (!$menu.StartsWith($patchStart) -or !$menu.Contains('window.__romNavigation') -or !$menu.EndsWith('})()')) { throw 'Menu source is missing or invalid.' }
        $cleanSource = $utf8.GetBytes($source)
        if ($utf8.GetString($current, $archive.Target.Offset, $archive.Target.Size) -eq $source) { $backupBytes = $current }
        else { $backupBytes = Build-Archive $archive $cleanSource }
        $backupHash = Get-Hash $backupBytes
        $patched = $utf8.GetBytes($source.Replace($hook, $menu + ',' + $hook))
        $output = Build-Archive (Read-Archive $current) $patched
        $unchanged = (Get-Hash $output) -eq $currentHash
        if ($unchanged -and (Test-Path -LiteralPath $statePath)) {
            $existingState = [IO.File]::ReadAllText($statePath) | ConvertFrom-Json
            if ($existingState.installedHash -eq $currentHash -and $existingState.backupHash -match '^[a-f0-9]{64}$') {
                $existingBackup = Join-Path $stateDir ($existingState.backupHash + '.asar')
                if ((Test-Path -LiteralPath $existingBackup) -and (Get-Hash ([IO.File]::ReadAllBytes($existingBackup))) -eq $existingState.backupHash) {
                    Write-Host 'This menu version is already installed; its restore backup is verified.'
                    exit 0
                }
            }
        }
        [IO.Directory]::CreateDirectory($stateDir) | Out-Null
        $backup = Join-Path $stateDir ($backupHash + '.asar')
        if (Test-Path -LiteralPath $backup) {
            if ((Get-Hash ([IO.File]::ReadAllBytes($backup))) -ne $backupHash) { throw 'Existing backup is damaged; refusing to overwrite it.' }
        } else { [IO.File]::WriteAllBytes($backup, $backupBytes) }
        if ($unchanged) {
            $record = @{ installedHash=$currentHash; backupHash=$backupHash; installedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
            [IO.File]::WriteAllText($statePath, $record, $utf8)
            Write-Host 'Existing menu adopted; a verified restore backup is now available.'
            exit 0
        }
    }
    # Stage and verify before replacing; no overwrite fallback for a locked game.
    $tempPath = $archivePath + '.rom-' + [guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllBytes($tempPath, $output)
    $outputHash = Get-Hash $output
    if ((Get-Hash ([IO.File]::ReadAllBytes($tempPath))) -ne $outputHash) { throw 'Staged file verification failed.' }
    if ((Get-Hash ([IO.File]::ReadAllBytes($archivePath))) -ne $currentHash) { throw 'Game archive changed while preparing the patch; retry after Steam finishes updating.' }
    $rollbackPath = $archivePath + '.rom-' + [guid]::NewGuid().ToString('N') + '.previous'
    [IO.File]::Replace($tempPath, $archivePath, $rollbackPath)
    if ((Get-Hash ([IO.File]::ReadAllBytes($archivePath))) -ne $outputHash) { throw 'Installed file verification failed.' }
    if (!$Restore) {
        $record = @{ installedHash=$outputHash; backupHash=$backupHash; installedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
        [IO.File]::WriteAllText($statePath, $record, $utf8)
        Write-Host "IdleOn Toolkit installed in $game. Start the game and press F8."
    } else { Write-Host 'Original game restored.' }
    Remove-Item -LiteralPath $rollbackPath -ErrorAction SilentlyContinue
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
