const fs = require('fs');
const path = require('path');
const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

async function captureState() {
  const userHome = os.homedir();
  const script = `
    # 1. Capture registry uninstall items
    $paths = @(
        "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
        "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
        "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
    )
    $apps = Get-ItemProperty $paths -ErrorAction SilentlyContinue | 
        Where-Object { $_.DisplayName } | 
        Select-Object -ExpandProperty DisplayName |
        Sort-Object -Unique
    
    # 2. Capture startup items
    $startup = Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | 
        Select-Object -ExpandProperty Name |
        Sort-Object -Unique

    # 3. Capture user PATH
    $pathVar = (Get-ItemProperty -Path "HKCU:\\Environment" -Name "Path").Path

    [PSCustomObject]@{
        Apps = $apps
        Startup = $startup
        Path = $pathVar
    } | ConvertTo-Json
  `;
  const res = await runPowerShellCapture(script);
  return res.stdout;
}

function getAsArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

module.exports = {
  name: '/snapshot',
  menuName: '💾  System State Snapshot ',
  desc: 'Save a system configuration snapshot and diff changes across sessions',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: System State Snapshot is only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[SNAPSHOT] Entering System State manager...${context.esc.reset}`);
    console.log(`  1. Create New State Snapshot`);
    console.log(`  2. Compare Two Existing Snapshots`);
    
    const choice = await context.askQuestion(`\nSelect an option (1-2): `);
    console.log();

    if (choice === '1') {
      context.startSpinner("Compiling system configuration snapshot");
      const json = await captureState();
      context.stopSpinner("Done");

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `ryoto-snapshot-${timestamp}.json`;
      const filepath = path.join(process.cwd(), filename);

      fs.writeFileSync(filepath, json, 'utf8');
      console.log(`${context.esc.green}✔ Snapshot successfully saved to:${context.esc.reset}`);
      console.log(`  ${context.esc.bold}${filepath}${context.esc.reset}\n`);
    } else if (choice === '2') {
      // Find snapshots in current directory supporting both old ryuu and new ryoto snapshots
      const files = fs.readdirSync(process.cwd()).filter(f => (f.startsWith('ryuu-snapshot-') || f.startsWith('ryoto-snapshot-')) && f.endsWith('.json')).sort();
      if (files.length < 2) {
        console.log(`${context.esc.red}Error: You need at least 2 snapshot files in the current folder to perform a comparison.${context.esc.reset}`);
        console.log(`Tip: Create a snapshot, install/uninstall a program or add a startup app, create another, and compare them!\n`);
        return;
      }

      console.log(`${context.esc.cyan}Available snapshots in current directory:${context.esc.reset}`);
      files.forEach((f, idx) => {
        console.log(`  [${idx + 1}] ${f}`);
      });

      const firstChoice = await context.askQuestion(`\nSelect first (older) snapshot (1-${files.length}): `);
      const secondChoice = await context.askQuestion(`Select second (newer) snapshot (1-${files.length}): `);

      const idx1 = parseInt(firstChoice) - 1;
      const idx2 = parseInt(secondChoice) - 1;

      if (idx1 >= 0 && idx1 < files.length && idx2 >= 0 && idx2 < files.length) {
        let snap1, snap2;
        try {
          snap1 = JSON.parse(fs.readFileSync(path.join(process.cwd(), files[idx1]), 'utf8'));
          snap2 = JSON.parse(fs.readFileSync(path.join(process.cwd(), files[idx2]), 'utf8'));
        } catch (err) {
          console.log(`${context.esc.red}Error: Failed to parse snapshot files. One of them may be corrupted: ${err.message}${context.esc.reset}\n`);
          return;
        }

        console.log(`\n${context.esc.yellow}${context.esc.bold}[DIFF] Comparing ${files[idx1]} vs ${files[idx2]}...${context.esc.reset}\n`);

        // Apps comparison (normalized for scalar vs array outputs)
        const apps1 = new Set(getAsArray(snap1.Apps));
        const apps2 = new Set(getAsArray(snap2.Apps));

        const addedApps = [...apps2].filter(x => !apps1.has(x));
        const removedApps = [...apps1].filter(x => !apps2.has(x));

        console.log(`${context.esc.cyan}📦 Applications Changes:${context.esc.reset}`);
        if (addedApps.length > 0) {
          console.log(`  ${context.esc.green}Added Programs:${context.esc.reset}`);
          addedApps.forEach(a => console.log(`    + ${a}`));
        }
        if (removedApps.length > 0) {
          console.log(`  ${context.esc.red}Removed Programs:${context.esc.reset}`);
          removedApps.forEach(a => console.log(`    - ${a}`));
        }
        if (addedApps.length === 0 && removedApps.length === 0) {
          console.log(`  No program installations or removals detected.`);
        }

        // Startup comparison (normalized for scalar vs array outputs)
        const startup1 = new Set(getAsArray(snap1.Startup));
        const startup2 = new Set(getAsArray(snap2.Startup));

        const addedStartup = [...startup2].filter(x => !startup1.has(x));
        const removedStartup = [...startup1].filter(x => !startup2.has(x));

        console.log(`\n${context.esc.cyan}🔌 Startup Item Changes:${context.esc.reset}`);
        if (addedStartup.length > 0) {
          console.log(`  ${context.esc.green}Added Startup Items:${context.esc.reset}`);
          addedStartup.forEach(s => console.log(`    + ${s}`));
        }
        if (removedStartup.length > 0) {
          console.log(`  ${context.esc.red}Removed Startup Items:${context.esc.reset}`);
          removedStartup.forEach(s => console.log(`    - ${s}`));
        }
        if (addedStartup.length === 0 && removedStartup.length === 0) {
          console.log(`  No startup items modified.`);
        }

        // PATH comparison
        const pathList1 = (snap1.Path || "").split(';').map(p => p.trim()).filter(p => p.length > 0);
        const pathList2 = (snap2.Path || "").split(';').map(p => p.trim()).filter(p => p.length > 0);

        const addedPath = pathList2.filter(x => !pathList1.includes(x));
        const removedPath = pathList1.filter(x => !pathList2.includes(x));

        console.log(`\n${context.esc.cyan}🌳 PATH Environment Changes:${context.esc.reset}`);
        if (addedPath.length > 0) {
          console.log(`  ${context.esc.green}Added Folder Links:${context.esc.reset}`);
          addedPath.forEach(p => console.log(`    + ${p}`));
        }
        if (removedPath.length > 0) {
          console.log(`  ${context.esc.red}Removed Folder Links:${context.esc.reset}`);
          removedPath.forEach(p => console.log(`    - ${p}`));
        }
        if (addedPath.length === 0 && removedPath.length === 0) {
          console.log(`  No PATH directories changed.`);
        }
        console.log();
      } else {
        console.log(`${context.esc.red}Invalid selection.${context.esc.reset}\n`);
      }
    } else {
      console.log(`${context.esc.red}Invalid selection.${context.esc.reset}\n`);
    }
  }
};
