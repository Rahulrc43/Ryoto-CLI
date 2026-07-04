const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { HOLDING_DIR } = require('../config');

// Retrieve or generate a persistent local secret key for signing backup manifests
function getVaultSecretKey() {
  const keyPath = path.join(os.homedir(), '.ryoto', '.vault-key');
  try {
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8').trim();
    }
    const newKey = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    // Write key file with standard owner-only permissions on Windows/UNIX
    fs.writeFileSync(keyPath, newKey, { encoding: 'utf8', mode: 0o600 });
    return newKey;
  } catch (e) {
    // Fallback static key if writing is disabled (least privilege fallback)
    return 'fallback-static-vault-signature-key-928374';
  }
}

// Generate signature for mapInfo object (excluding the signature field itself)
function signMapInfo(mapInfo) {
  const secret = getVaultSecretKey();
  const rawData = JSON.stringify({ ...mapInfo, signature: undefined });
  return crypto.createHmac('sha256', secret).update(rawData).digest('hex');
}

// Verify signature of mapInfo object
function verifyMapInfo(mapInfo) {
  if (!mapInfo || !mapInfo.signature) return false;
  const secret = getVaultSecretKey();
  const rawData = JSON.stringify({ ...mapInfo, signature: undefined });
  const expected = crypto.createHmac('sha256', secret).update(rawData).digest('hex');
  return mapInfo.signature === expected;
}

// Helper to sign and write map.json
function saveBackupManifest(sessionHoldingDir, mapInfo) {
  const signature = signMapInfo(mapInfo);
  const signedMapInfo = { ...mapInfo, signature };
  fs.writeFileSync(
    path.join(sessionHoldingDir, 'map.json'),
    JSON.stringify(signedMapInfo, null, 2),
    'utf8'
  );
}

// Safe file/folder moving with volume cross-device fallback, moving directory as a unit first
function moveToHolding(srcPath, destDir, mapInfo) {
  if (!fs.existsSync(srcPath)) return false;
  try {
    const name = path.basename(srcPath);
    const destPath = path.join(destDir, name);

    // Try to move the directory or file as a single unit first (very fast!)
    try {
      fs.renameSync(srcPath, destPath);
      mapInfo.files.push({ 
        original: srcPath, 
        current: destPath, 
        type: fs.statSync(destPath).isDirectory() ? 'dir' : 'file' 
      });
      return true;
    } catch (err) {
      if (err.code === 'EXDEV') {
        // Fallback for cross-device moves
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          const files = fs.readdirSync(srcPath);
          files.forEach(f => {
            moveToHolding(path.join(srcPath, f), destPath, mapInfo);
          });
          try { fs.rmdirSync(srcPath); } catch (e) {}
        } else {
          fs.copyFileSync(srcPath, destPath);
          fs.unlinkSync(srcPath);
          mapInfo.files.push({ original: srcPath, current: destPath, type: 'file' });
        }
        return true;
      } else {
        throw err;
      }
    }
  } catch (e) {
    return false;
  }
}

function listBackups() {
  if (!fs.existsSync(HOLDING_DIR)) return [];
  try {
    const folders = fs.readdirSync(HOLDING_DIR).sort();
    const list = [];
    folders.forEach(f => {
      const mapPath = path.join(HOLDING_DIR, f, 'map.json');
      if (fs.existsSync(mapPath)) {
        try {
          const mapInfo = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
          
          // Auto-sign legacy backups created without a signature
          if (!mapInfo.signature) {
            saveBackupManifest(path.join(HOLDING_DIR, f), mapInfo);
            mapInfo.signature = signMapInfo(mapInfo); // local update for listing integrity
          }

          list.push({
            folder: f,
            timestamp: mapInfo.timestamp || f,
            category: mapInfo.category || 'General',
            filesCount: mapInfo.files ? mapInfo.files.length : 0
          });
        } catch (e) {}
      }
    });
    return list;
  } catch (e) {
    return [];
  }
}

function isSafeRestorePath(originalPath, type) {
  if (typeof originalPath !== 'string') return false;
  
  const normalized = path.normalize(originalPath).toLowerCase();
  
  // Prevent any restoration into critical system directories
  const unsafePatterns = [
    /^[a-z]:\\windows/i,
    /^[a-z]:\\program files/i,
    /^[a-z]:\\program files \(x86\)/i,
    /^[a-z]:\\system volume information/i,
    /^[a-z]:\\\$recycle\.bin/i,
    /\\etc\\/i
  ];
  
  if (unsafePatterns.some(pattern => pattern.test(normalized))) {
    return false;
  }
  
  if (type === 'startup') {
    // Startup shortcuts must strictly end in Microsoft\Windows\Start Menu\Programs\Startup\<name>.lnk
    const startupPattern = /\\microsoft\\windows\\start menu\\programs\\startup\\[^\\]+\.lnk$/i;
    return startupPattern.test(normalized);
  }
  
  // For general file restores, target must either contain node_modules or reside under homeDir or cwdDir
  const homeDir = os.homedir().toLowerCase();
  const cwdDir = process.cwd().toLowerCase();
  
  if (normalized.includes('node_modules')) {
    return true;
  }
  
  if (normalized.startsWith(homeDir) || normalized.startsWith(cwdDir)) {
    return true;
  }
  
  return false;
}

function restoreBackup(backupFolderName) {
  const mapPath = path.join(HOLDING_DIR, backupFolderName, 'map.json');
  if (!fs.existsSync(mapPath)) return 0;
  
  let mapInfo;
  try {
    mapInfo = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch (err) {
    return 0; // Return 0 if map.json is corrupted
  }

  // Strict cryptographic signature validation to prevent backup tampering
  if (!verifyMapInfo(mapInfo)) {
    console.error(`\n\x1b[31m[SECURITY ERROR] Backup snapshot integrity check failed!`);
    console.error(`The manifest map.json signature is invalid or has been tampered with.\x1b[0m\n`);
    return 0;
  }
  
  // Specific restore logic for PATH Environment variables
  if (mapInfo.type === 'env' || mapInfo.category === 'PATH Backup') {
    const backupTxtPath = path.join(HOLDING_DIR, backupFolderName, 'path-backup.txt');
    if (fs.existsSync(backupTxtPath)) {
      try {
        const originalPath = fs.readFileSync(backupTxtPath, 'utf8').trim();
        const tempPathFile = path.join(os.tmpdir(), 'restore-path.txt');
        fs.writeFileSync(tempPathFile, originalPath, 'utf8');
        
        const res = spawnSync('powershell', ['-NoProfile', '-Command', `
          $p = [System.IO.File]::ReadAllText("${tempPathFile.replace(/\\/g, '\\\\')}")
          [System.Environment]::SetEnvironmentVariable("Path", $p, "User")
          Remove-Item "${tempPathFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
        `], { encoding: 'utf8' });
        
        if (res.status !== 0 || res.error) {
          try { fs.unlinkSync(tempPathFile); } catch (e) {}
          return 0; // Failure - do not delete the backup
        }
        
        fs.rmSync(path.join(HOLDING_DIR, backupFolderName), { recursive: true, force: true });
        return 1; // 1 PATH variable restored
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  // Specific restore logic for Startup Disabled items
  if (mapInfo.type === 'startup' || mapInfo.category === 'Startup Disable') {
    if (mapInfo.registry) {
      const allowedPaths = [
        "hkcu:\\software\\microsoft\\windows\\currentversion\\run",
        "hklm:\\software\\microsoft\\windows\\currentversion\\run"
      ];
      const regPath = mapInfo.registry.path;
      if (!regPath || !allowedPaths.includes(regPath.toLowerCase())) {
        return 0; // Reject: registry path not in allowlist
      }
      try {
        const tempStartupFile = path.join(os.tmpdir(), 'restore-startup.txt');
        fs.writeFileSync(tempStartupFile, JSON.stringify(mapInfo.registry), 'utf8');
        
        const res = spawnSync('powershell', ['-NoProfile', '-Command', `
          $data = Get-Content "${tempStartupFile.replace(/\\/g, '\\\\')}" -Raw | ConvertFrom-Json
          Remove-Item "${tempStartupFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
          # Ensure key path exists in registry
          if (-not (Test-Path $data.path)) {
              New-Item -Path (Split-Path $data.path) -Name (Split-Path $data.path -Leaf) -Force -ErrorAction SilentlyContinue | Out-Null
          }
          Set-ItemProperty -Path $data.path -Name $data.name -Value $data.value -Force -ErrorAction Stop
          
          # Delete StartupApproved override if exists
          $approvedPath = if ($data.path -like "*HKLM*") {
              "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
          } else {
              "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
          }
          if (Test-Path $approvedPath) {
              Remove-ItemProperty -Path $approvedPath -Name $data.name -Force -ErrorAction SilentlyContinue
          }
        `], { encoding: 'utf8' });
        
        if (res.status !== 0 || res.error) {
          try { fs.unlinkSync(tempStartupFile); } catch (e) {}
          return 0;
        }
      } catch (e) {
        return 0;
      }
    }

    // Restore shortcut files if any
    let restoredCount = 0;
    if (Array.isArray(mapInfo.files)) {
      mapInfo.files.forEach(f => {
        if (!isSafeRestorePath(f.original, 'startup')) {
          return; // Skip unsafe restore target path
        }
        try {
          if (fs.existsSync(f.current)) {
            fs.mkdirSync(path.dirname(f.original), { recursive: true });
            fs.renameSync(f.current, f.original);
            restoredCount++;
            
            // Delete StartupApproved\StartupFolder override if exists
            const name = path.basename(f.original);
            const isCommon = f.original.toLowerCase().includes('programdata') || f.original.toLowerCase().includes('all users');
            const approvedPath = isCommon ? 
                "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder" :
                "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder";
            
            spawnSync('powershell', ['-NoProfile', '-Command', `
              if (Test-Path "${approvedPath}") {
                  Remove-ItemProperty -Path "${approvedPath}" -Name "${name}" -Force -ErrorAction SilentlyContinue
              }
            `]);
          }
        } catch (err) {
          if (err.code === 'EXDEV') {
            try {
              fs.copyFileSync(f.current, f.original);
              fs.unlinkSync(f.current);
              restoredCount++;
            } catch (e) {}
          }
        }
      });
    }

    try {
      fs.rmSync(path.join(HOLDING_DIR, backupFolderName), { recursive: true, force: true });
    } catch (e) {}

    return mapInfo.registry ? 1 : restoredCount;
  }

  let restoredCount = 0;
  if (Array.isArray(mapInfo.files)) {
    mapInfo.files.forEach(f => {
      if (!isSafeRestorePath(f.original)) {
        return; // Skip unsafe restore target path
      }
      try {
        if (fs.existsSync(f.current)) {
          fs.mkdirSync(path.dirname(f.original), { recursive: true });
          fs.renameSync(f.current, f.original);
          restoredCount++;
        }
      } catch (err) {
        if (err.code === 'EXDEV') {
          try {
            fs.copyFileSync(f.current, f.original);
            fs.unlinkSync(f.current);
            restoredCount++;
          } catch (e) {}
        }
      }
    });
  }
  
  try {
    fs.rmSync(path.join(HOLDING_DIR, backupFolderName), { recursive: true, force: true });
  } catch (e) {}
  
  return restoredCount;
}

function clearExpiredHoldings(expiryHours) {
  try {
    if (!fs.existsSync(HOLDING_DIR)) return;
    const folders = fs.readdirSync(HOLDING_DIR);
    const now = Date.now();
    const expiryMs = expiryHours * 60 * 60 * 1000;

    folders.forEach(f => {
      const folderPath = path.join(HOLDING_DIR, f);
      const stat = fs.statSync(folderPath);
      if (now - stat.mtimeMs > expiryMs) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    });
  } catch (e) {}
}

module.exports = {
  moveToHolding,
  listBackups,
  restoreBackup,
  clearExpiredHoldings,
  saveBackupManifest
};
