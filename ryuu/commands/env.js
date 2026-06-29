const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');
const { HOLDING_DIR } = require('../config');

module.exports = {
  name: '/env',
  menuName: '🌳  PATH Env Auditor     ',
  desc: 'Audit the system PATH variable, remove duplicates, and prune dead folder links',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: PATH Env Auditor is only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[ENV AUDIT] Querying PATH registry variables...${context.esc.reset}\n`);
    
    // Read HKCU user PATH variable
    const result = await context.runTask("Reading user Environment PATH", async () => {
      const script = `
        (Get-ItemProperty -Path "HKCU:\\Environment" -Name "Path").Path
      `;
      const res = await runPowerShellCapture(script);
      return res.stdout;
    });

    if (!result) {
      console.log(`${context.esc.red}Error: Could not retrieve user PATH variable.${context.esc.reset}\n`);
      return;
    }

    const rawPaths = result.split(';').map(p => p.trim()).filter(p => p.length > 0);
    const duplicates = [];
    const deadPaths = [];
    const uniqueSeen = new Set();
    const cleanPaths = [];

    rawPaths.forEach(p => {
      // Resolve environmental variables like %USERPROFILE%
      let resolved = p;
      if (p.includes('%')) {
        resolved = p.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
      }

      const exists = fs.existsSync(resolved);
      const isDup = uniqueSeen.has(p.toLowerCase());

      if (isDup) {
        duplicates.push(p);
      } else {
        uniqueSeen.add(p.toLowerCase());
        if (!exists) {
          deadPaths.push(p);
        } else {
          cleanPaths.push(p);
        }
      }
    });

    console.log(`${context.esc.cyan}┌── PATH AUDIT REPORT ────────────────────────────────────────────────┐${context.esc.reset}`);
    console.log(`  Total PATH Entries  : ${rawPaths.length}`);
    console.log(`  Duplicate Entries   : ${context.esc.yellow}${duplicates.length}${context.esc.reset}`);
    console.log(`  Dead Folder Links   : ${context.esc.red}${deadPaths.length}${context.esc.reset}`);
    console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    if (duplicates.length > 0) {
      console.log(`${context.esc.yellow}Duplicate entries found:${context.esc.reset}`);
      duplicates.forEach(d => console.log(`  - ${d}`));
    }

    if (deadPaths.length > 0) {
      console.log(`\n${context.esc.red}Dead folders found (pointing to folders that do not exist):${context.esc.reset}`);
      deadPaths.forEach(d => console.log(`  - ${d}`));
    }

    if (duplicates.length === 0 && deadPaths.length === 0) {
      console.log(`${context.esc.green}✔ Your PATH variable is clean, optimized, and contains zero dead links!${context.esc.reset}\n`);
      return;
    }

    const fixChoice = await context.askQuestion(`Do you want to optimize your user PATH by removing dead links and duplicates? (y/n): `);
    if (fixChoice.toLowerCase() === 'y' || fixChoice.toLowerCase() === 'yes') {
      const newPathStr = cleanPaths.join(';');
      
      context.startSpinner("Writing updated PATH to registry");
      
      // 1. Save backup to vault first (high safety!)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(HOLDING_DIR, `env-${timestamp}`);
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'path-backup.txt'), result, 'utf8');
      fs.writeFileSync(path.join(backupDir, 'map.json'), JSON.stringify({ 
        timestamp: new Date().toISOString(), 
        category: 'PATH Backup', 
        type: 'env', 
        files: [] 
      }), 'utf8');

      // 2. Write new PATH safely using temp file redirection to avoid injection/escaping bugs
      const tempPathFile = path.join(os.tmpdir(), 'new-path.txt');
      fs.writeFileSync(tempPathFile, newPathStr, 'utf8');

      const writeScript = `
        $newPath = [System.IO.File]::ReadAllText("${tempPathFile.replace(/\\/g, '\\\\')}")
        [System.Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Remove-Item "${tempPathFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
      `;
      const res = await runPowerShellCapture(writeScript);
      context.stopSpinner("Done");

      console.log(`${context.esc.green}✔ User PATH variable optimized and written successfully!${context.esc.reset}`);
      console.log(`${context.esc.cyan}Backup saved! You can restore your original PATH at any time by running /clean --restore.${context.esc.reset}\n`);
    } else {
      console.log(`\n${context.esc.cyan}Audit completed. No changes were made.${context.esc.reset}\n`);
    }
  }
};
