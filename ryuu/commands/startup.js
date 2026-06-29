const os = require('os');
const fs = require('fs');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');
const { HOLDING_DIR } = require('../config');
const { moveToHolding } = require('../lib/vault');

module.exports = {
  name: '/startup',
  menuName: '🔌  Startup Manager       ',
  desc: 'Enumerate boot startup commands and disable resource-heavy entries',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Startup Manager is only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[STARTUP] Querying active startup configuration...${context.esc.reset}\n`);
    
    const result = await context.runTask("Querying startup applications", async () => {
      const script = `
        $items = Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | ForEach-Object {
            $impact = "Medium"
            if ($_.Command -match "Discord|Steam|EpicGames|Spotify") { $impact = "High" }
            elseif ($_.Command -match "OneDrive|Teams|Skype") { $impact = "Medium" }
            else { $impact = "Low" }
            
            [PSCustomObject]@{
                Name = $_.Name
                Command = $_.Command
                Location = $_.Location
                Impact = $impact
            }
        }
        $items | ConvertTo-Json
      `;
      const res = await runPowerShellCapture(script);
      return res.stdout;
    });

    let startupItems = [];
    try {
      if (result) {
        startupItems = JSON.parse(result);
        if (!Array.isArray(startupItems)) {
          startupItems = [startupItems];
        }
      }
    } catch (e) {}

    if (startupItems.length === 0) {
      console.log(`${context.esc.green}✔ No startup applications detected on PATH.${context.esc.reset}\n`);
      return;
    }

    console.log(`${context.esc.cyan}┌── ACTIVE STARTUP APPLICATIONS ──────────────────────────────────────┐${context.esc.reset}`);
    startupItems.forEach((item, index) => {
      const num = index + 1;
      const cmdShort = item.Command.length > 40 ? item.Command.slice(0, 37) + "..." : item.Command;
      const impactColor = item.Impact === 'High' ? context.esc.red : (item.Impact === 'Medium' ? context.esc.yellow : context.esc.green);
      console.log(`  [${num}] ${item.Name.padEnd(20)} Impact: ${impactColor}${item.Impact.padEnd(7)}${context.esc.reset} Command: ${cmdShort}`);
    });
    console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    const disableChoice = await context.askQuestion(`Enter the number of an application to disable (or press Enter to skip): `);
    const idx = parseInt(disableChoice) - 1;

    if (idx >= 0 && idx < startupItems.length) {
      const target = startupItems[idx];
      console.log(`\nAttempting to disable: ${target.Name}...`);
      
      // 1. Create holding vault session dir for backup before disabling
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionHoldingDir = path.join(HOLDING_DIR, timestamp);
      fs.mkdirSync(sessionHoldingDir, { recursive: true });

      let mapInfo = {
        timestamp: new Date().toISOString(),
        category: 'Startup Disable',
        type: 'startup',
        files: []
      };

      let success = false;

      if (target.Location.includes('Run')) {
        // Registry based startup
        mapInfo.registry = {
          path: target.Location.includes('HKLM') ? "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" : "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          name: target.Name,
          value: target.Command
        };
        fs.writeFileSync(path.join(sessionHoldingDir, 'map.json'), JSON.stringify(mapInfo, null, 2), 'utf8');

        // Delete from Registry
        const tempStartupFile = path.join(os.tmpdir(), 'ryoto-startup-info.txt');
        fs.writeFileSync(tempStartupFile, JSON.stringify({ name: target.Name, location: target.Location }), 'utf8');

        const disableScript = `
          $data = Get-Content "${tempStartupFile.replace(/\\/g, '\\\\')}" -Raw | ConvertFrom-Json
          Remove-Item "${tempStartupFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
          $name = $data.name
          $location = $data.location
          $regPath = if ($location -like "*HKLM*") { "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" } else { "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" }
          Remove-ItemProperty -Path $regPath -Name $name -Force -ErrorAction Stop
          Write-Host "SUCCESS"
        `;

        context.startSpinner("Disabling registry startup entry");
        const res = await runPowerShellCapture(disableScript);
        context.stopSpinner("Done");

        if (res.stdout.includes("SUCCESS")) {
          success = true;
        }
      } else if (target.Location.includes('Startup')) {
        // Startup folder shortcut link based startup
        const shortcutPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', target.Name + '.lnk');
        
        context.startSpinner("Moving startup shortcut to holding vault");
        if (fs.existsSync(shortcutPath)) {
          const moved = moveToHolding(shortcutPath, sessionHoldingDir, mapInfo);
          if (moved) {
            success = true;
          }
        } else {
          console.log(`${context.esc.red}Startup shortcut file not found at ${shortcutPath}.${context.esc.reset}`);
        }
        fs.writeFileSync(path.join(sessionHoldingDir, 'map.json'), JSON.stringify(mapInfo, null, 2), 'utf8');
        context.stopSpinner("Done");
      }

      if (success) {
        console.log(`${context.esc.green}✔ Successfully disabled startup application "${target.Name}"!${context.esc.reset}`);
        console.log(`${context.esc.cyan}Tip: You can restore this startup item by running /clean --restore${context.esc.reset}\n`);
      } else {
        // Clean up empty holding directory if backup/disable failed
        try {
          fs.rmSync(sessionHoldingDir, { recursive: true, force: true });
        } catch (e) {}
        console.log(`${context.esc.red}Failed to disable: Permission denied or item not found (Admin privileges may be required).${context.esc.reset}\n`);
      }
    } else if (disableChoice.trim().length > 0) {
      console.log(`${context.esc.red}Invalid selection.${context.esc.reset}\n`);
    }
  }
};
