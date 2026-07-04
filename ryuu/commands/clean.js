const os = require('os');
const path = require('path');
const fs = require('fs');
const { HOLDING_DIR, loadConfig } = require('../config');
const { moveToHolding, listBackups, restoreBackup, clearExpiredHoldings, saveBackupManifest } = require('../lib/vault');
const stats = require('../lib/stats');
const { runPowerShellCapture } = require('../lib/shell');

async function handleRestore(context) {
  console.log(`\n${context.esc.yellow}[RESTORE] Querying holding backups...${context.esc.reset}`);
  
  const backups = listBackups();
  if (backups.length === 0) {
    console.log(`${context.esc.red}No backups found in holding.${context.esc.reset}\n`);
    return;
  }

  let selectedBackup = backups[backups.length - 1].folder;

  if (backups.length > 1) {
    console.log(`${context.esc.cyan}Found multiple backup snapshots in holding:${context.esc.reset}`);
    backups.forEach((b, index) => {
      console.log(`  [${index + 1}] Timestamp: ${b.timestamp} (${b.filesCount} items)`);
    });
    
    const choice = await context.askQuestion(`\nSelect backup to restore (1-${backups.length}) [default: latest]: `);
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < backups.length) {
      selectedBackup = backups[idx].folder;
    } else if (choice.trim().length > 0) {
      console.log(`${context.esc.red}Invalid selection. Restoring latest backup...${context.esc.reset}`);
    }
  }

  console.log(`Restoring snapshot ${selectedBackup}...`);
  const restoredCount = restoreBackup(selectedBackup);
  console.log(`${context.esc.green}✔ Restored ${restoredCount} items successfully!${context.esc.reset}\n`);
}

module.exports = {
  name: '/clean',
  menuName: '⚡  System Quick Clean   ',
  desc: 'Purge temp files and caches (node_modules backed up to holding)',
  run: async (context, args = []) => {
    if (args.includes('restore') || args.includes('--restore')) {
      await handleRestore(context);
      return;
    }

    const dryRun = args.includes('--dry-run') || args.includes('-d');
    if (dryRun) {
      console.log(`\n${context.esc.yellow}${context.esc.bold}[DRY RUN] Simulating Quick Clean...${context.esc.reset}\n`);
    } else if (!args.includes('--force') && !args.includes('-f')) {
      const confirm = await context.askQuestion(`Are you sure you want to run System Quick Clean? (y/n): `);
      if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        console.log(`\n${context.esc.cyan}Cleanup cancelled.${context.esc.reset}\n`);
        return;
      }
    }

    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Quick Clean is currently only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    const config = loadConfig();
    if (!dryRun) {
      clearExpiredHoldings(config.holdingExpiryHours);
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[SYSTEM CLEAN] Purging caches and temporary files...${context.esc.reset}\n`);
    
    const userHome = os.homedir();
    const localNodeModules = path.join(process.cwd(), 'node_modules');
    const homeNodeModules = path.join(userHome, 'node_modules');

    const targetsToVault = [];
    if (fs.existsSync(localNodeModules)) targetsToVault.push(localNodeModules);
    if (fs.existsSync(homeNodeModules)) targetsToVault.push(homeNodeModules);

    // Shared list of paths to keep dry-run and actual cleaning in sync
    const cacheDirectories = [
      { name: 'NPM Cache', path: path.join(userHome, 'AppData', 'Local', 'npm-cache') },
      { name: 'Pip Cache', path: path.join(userHome, 'AppData', 'Local', 'pip', 'cache') },
      { name: 'Conda Cache Packages', path: path.join(userHome, 'anaconda3', 'Scripts', 'conda.exe'), isConda: true },
      { name: 'Phone Link CrossDevice Cache', path: path.join(userHome, 'CrossDevice') },
      { name: 'User System Temp files', path: os.tmpdir(), isTemp: true, envVar: '$env:TEMP' },
      { name: 'Windows Root Temp files', path: path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp'), isTemp: true, envVar: '$env:SystemRoot\\Temp' }
    ];

    if (dryRun) {
      console.log(`${context.esc.cyan}Files/folders that would be moved to holding:${context.esc.reset}`);
      if (targetsToVault.length === 0) {
        console.log(`  -> None detected.`);
      } else {
        targetsToVault.forEach(t => console.log(`  -> ${t}`));
      }
      console.log(`\nCaches that would be permanently deleted:`);
      cacheDirectories.forEach(c => {
        console.log(`  -> ${c.name}: ${c.path}`);
      });
      console.log(`\n${context.esc.green}[DRY RUN] Simulation finished. No files were modified.${context.esc.reset}\n`);
      return;
    }

    await context.runTask("Cleaning system temp directories and dev caches", async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionHoldingDir = path.join(HOLDING_DIR, timestamp);
      fs.mkdirSync(sessionHoldingDir, { recursive: true });

      const mapInfo = {
        timestamp: new Date().toISOString(),
        files: []
      };

      // 1. Move target node_modules to holding
      targetsToVault.forEach(target => {
        moveToHolding(target, sessionHoldingDir, mapInfo);
      });

      // Write mapping map.json
      saveBackupManifest(sessionHoldingDir, mapInfo);

      // 2. PowerShell background deletion for temp caches
      let deleteCommands = "";
      cacheDirectories.forEach(c => {
        if (c.isConda) {
          deleteCommands += `
            if (Test-Path "${c.path}") {
                & "${c.path}" clean --all -y | Out-Null
            }
          `;
        } else if (c.isTemp) {
          deleteCommands += `
            Get-ChildItem -Path "${c.envVar}" -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
          `;
        } else {
          deleteCommands += `
            if (Test-Path "${c.path}") {
                Remove-Item -Recurse -Force "${c.path}" -ErrorAction SilentlyContinue
            }
          `;
        }
      });

      const cleanScript = `
        $systemDrive = $env:SystemDrive.Replace(":", "")
        $before = (Get-PSDrive $systemDrive).Free
        
        ${deleteCommands}
        
        $after = (Get-PSDrive $systemDrive).Free
        $freed = [math]::Round(($after - $before) / 1MB, 2)
        Write-Host "FREED_SIZE:$freed"
      `;

      const res = await runPowerShellCapture(cleanScript, { timeoutMs: 60000 });
      const cleanOutput = res.stdout;
      
      let freedMB = 0;
      const m = cleanOutput.match(/FREED_SIZE:([\d\.]+)/);
      if (m) {
        freedMB = parseFloat(m[1]);
      }

      // Add to session statistics
      stats.freedMB += freedMB;
      stats.scansRun++;
      if (mapInfo.files.length > 0) {
        stats.backupsCreated++;
      }

      console.log(`\nReclaimed space: ${context.esc.bold}${freedMB} MB${context.esc.reset}`);
      if (mapInfo.files.length > 0) {
        console.log(`${context.esc.green}✔ Backup of node_modules saved to holding.${context.esc.reset}`);
        console.log(`${context.esc.cyan}Tip: You can undo this action by running /clean --restore${context.esc.reset}\n`);
      }
    });
  }
};
