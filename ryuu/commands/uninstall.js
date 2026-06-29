const os = require('os');
const fs = require('fs');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');
const { checkPlatform } = require('../lib/helpers');

module.exports = {
  name: '/uninstall',
  menuName: '🗑️  Package Uninstaller   ',
  desc: 'Interactive software uninstaller listing installed programs sorted by size',
  run: async (context) => {
    if (!checkPlatform(context)) return;

    console.log(`\n${context.esc.yellow}${context.esc.bold}[UNINSTALLER] Querying installed programs...${context.esc.reset}\n`);
    
    const result = await context.runTask("Gathering installed applications", async () => {
      const script = `
        $paths = @(
            "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
            "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
            "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
        )
        $apps = Get-ItemProperty $paths -ErrorAction SilentlyContinue | 
            Where-Object { $_.DisplayName -and $_.UninstallString } | 
            Select-Object DisplayName, DisplayVersion, EstimatedSize, UninstallString |
            Group-Object DisplayName | 
            ForEach-Object { $_.Group[0] }
        
        $apps | ForEach-Object {
            $size = 0
            if ($_.EstimatedSize) { $size = [math]::Round($_.EstimatedSize / 1024, 1) }
            [PSCustomObject]@{
                Name = $_.DisplayName
                Version = $_.DisplayVersion
                SizeMB = $size
                UninstallString = $_.UninstallString
            }
        } | Sort-Object SizeMB -Descending | Select-Object -First 30 | ConvertTo-Json
      `;
      const res = await runPowerShellCapture(script);
      return res.stdout;
    });

    let apps = [];
    try {
      if (result) {
        apps = JSON.parse(result);
        if (!Array.isArray(apps)) {
          apps = [apps];
        }
      }
    } catch (e) {}

    if (apps.length === 0) {
      console.log(`${context.esc.red}No installed applications detected via registry keys.${context.esc.reset}\n`);
      return;
    }

    console.log(`${context.esc.cyan}┌── INSTALLED APPLICATIONS (SORTED BY EST. SIZE) ─────────────────────┐${context.esc.reset}`);
    apps.forEach((app, index) => {
      const num = index + 1;
      const sizeStr = app.SizeMB > 0 ? `${app.SizeMB} MB` : "Unknown size";
      const nameShort = app.Name.length > 35 ? app.Name.slice(0, 32) + "..." : app.Name;
      console.log(`  [${num.toString().padEnd(2)}] ${nameShort.padEnd(36)} Version: ${(app.Version || 'N/A').padEnd(12)} Size: ${sizeStr}`);
    });
    console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    const selection = await context.askQuestion(`Select the number of the app you want to uninstall (or press Enter to skip): `);
    const idx = parseInt(selection) - 1;

    if (idx >= 0 && idx < apps.length) {
      const target = apps[idx];
      console.log(`\n${context.esc.red}${context.esc.bold}⚠️  WARNING: Native uninstallation cannot be undone or stored in holding!${context.esc.reset}`);
      console.log(`App Name: ${target.Name}`);
      console.log(`Uninstall String: ${target.UninstallString}`);

      const doubleCheck = await context.askQuestion(`Are you absolutely sure you want to uninstall this application? (yes/no): `);
      if (doubleCheck.toLowerCase() === 'yes') {
        console.log(`\nLaunching uninstaller...`);
        context.startSpinner("Executing uninstaller command");

        // 1. Write the raw uninstall string to a temp file to completely avoid PowerShell variable interpolation/escaping exploits
        const tempUninstallFile = path.join(os.tmpdir(), 'ryoto-uninstall-str.txt');
        fs.writeFileSync(tempUninstallFile, target.UninstallString, 'utf8');

        // 2. Safe execution script: Parse path & args and call Start-Process directly without cmd.exe /c shell wrapping
        const uninstallScript = `
          $rawStr = [System.IO.File]::ReadAllText("${tempUninstallFile.replace(/\\/g, '\\\\')}").Trim()
          Remove-Item "${tempUninstallFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue

          $exe = ""
          $args = ""

          # Safely parse the executable path and parameters
          if ($rawStr -like '"*') {
              $regex = '^"([^"]+)"(.*)$'
              if ($rawStr -match $regex) {
                  $exe = $Matches[1]
                  $args = $Matches[2].Trim()
              }
          } else {
              $idx = $rawStr.IndexOf(".exe ")
              if ($idx -gt 0) {
                  $exe = $rawStr.Substring(0, $idx + 4).Trim()
                  $args = $rawStr.Substring($idx + 4).Trim()
              } else {
                  $parts = $rawStr -split " ", 2
                  $exe = $parts[0]
                  $args = if ($parts.Length -gt 1) { $parts[1] } else { "" }
              }
          }

          if ($exe) {
              # Strict formatting check: If it's MSIExec, configure standard quiet flags
              if ($exe -match "msiexec") {
                  $args = $args -replace '(?<=\s|^)/[Ii](?=\s|$)', '/X'
                  if ($args -notmatch "/qn") { $args += " /qn" }
                  if ($args -notmatch "/norestart") { $args += " /norestart" }
              }
              
              # Run binary directly via Start-Process (avoids shell cmd.exe injection vectors)
              Start-Process -FilePath $exe -ArgumentList $args -Wait -NoNewWindow -ErrorAction Stop
          } else {
              Write-Error "Failed to parse uninstall string."
          }
        `;

        const res = await runPowerShellCapture(uninstallScript);
        context.stopSpinner("Done");

        if (res.success) {
          console.log(`${context.esc.green}✔ Uninstaller task complete.${context.esc.reset}\n`);
        } else {
          console.log(`${context.esc.red}Uninstallation failed. See logs for details.${context.esc.reset}\n`);
        }
      } else {
        console.log(`\n${context.esc.cyan}Uninstallation cancelled.${context.esc.reset}\n`);
      }
    } else if (selection.trim().length > 0) {
      console.log(`${context.esc.red}Invalid selection.${context.esc.reset}\n`);
    }
  }
};
