const os = require('os');
const fs = require('fs');
const path = require('path');
const { getBatteryStatus } = require('../lib/battery');
const { logTrendEntry, getTrendEntries } = require('../lib/trends');
const { listBackups } = require('../lib/vault');
const { HOLDING_DIR } = require('../config');
const { runPowerShellCapture } = require('../lib/shell');

function getDirSize(dir) {
  let size = 0;
  try {
    if (!fs.existsSync(dir)) return 0;
    const list = fs.readdirSync(dir);
    list.forEach(f => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        size += getDirSize(p);
      } else {
        size += stat.size;
      }
    });
  } catch (e) {}
  return size;
}

module.exports = {
  name: '/advisor',
  menuName: '🤖  System Health Advisor ',
  desc: 'Local agent analysis and custom laptop maintenance suggestions',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Advisor checks are currently only optimized for Windows systems.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[HEALTH ADVISOR] Analyzing laptop parameters...${context.esc.reset}\n`);
    context.startSpinner("Diagnosing system health");

    // 1. Diagnostics script for disk space, MySQL, and temp folder size
    const advScript = `
      $systemDrive = $env:SystemDrive.Replace(":", "")
      $drive = Get-PSDrive $systemDrive
      $freePct = [math]::Round(($drive.Free / ($drive.Free + $drive.Used)) * 100, 1)
      
      $mysql = Get-Service -Name "MySQL80" -ErrorAction SilentlyContinue
      $mysqlRunning = $mysql -and $mysql.Status -eq "Running"

      $tempSize = 0
      if (Test-Path $env:TEMP) {
          $tempSize = (Get-ChildItem -Path $env:TEMP -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
      }

      Write-Host "ADVISOR_STATUS:$($freePct):$($mysqlRunning.ToString()):$([math]::Round($tempSize,1))"
    `;

    const res = await runPowerShellCapture(advScript);
    const advOutput = res.stdout;

    // 2. Fetch WMI/HTML battery diagnostics from shared Node helper
    const battery = await getBatteryStatus();

    context.stopSpinner("Analysis completed");

    const m = advOutput.match(/ADVISOR_STATUS:([\d\.]+):(\w+):([\d\.]+)/);
    if (m) {
      const [, freePctStr, mysqlRunningStr, tempMBStr] = m;
      const freePct = parseFloat(freePctStr);
      const mysqlRunning = mysqlRunningStr.toLowerCase() === 'true';
      const tempMB = parseFloat(tempMBStr);

      // Record trend entries
      const lastTrends = getTrendEntries();
      logTrendEntry({
        freePct,
        tempMB,
        batteryHealth: battery.health
      });

      console.log(`${context.esc.cyan}${context.esc.bold}🤖 Ryoto System Advisor Recommendations:${context.esc.reset}`);
      
      // Build recommendations
      const recommendations = [];

      // A. Storage recommendation
      let storageAlert = "";
      if (freePct < 15) {
        storageAlert = `    ${context.esc.red}${context.esc.bold}[CRITICAL] Low Disk Space Alert:${context.esc.reset}\n`;
        storageAlert += `    Your C:\\ drive has only ${freePct}% free space left. Running /clean or clearing large directories via /disk is highly recommended.`;
      }
      // Check historical storage trends
      if (lastTrends.length > 0) {
        const prev = lastTrends[lastTrends.length - 1];
        const diff = prev.freePct - freePct;
        if (diff > 0.5) {
          if (!storageAlert) {
            storageAlert = `    ${context.esc.yellow}${context.esc.bold}[INFO] Storage Utilization Alert:${context.esc.reset}\n`;
            storageAlert += `    Your free disk space is currently healthy at ${freePct}%, but it is decreasing.`;
          }
          storageAlert += `\n    ${context.esc.dim}(Note: Your free disk space decreased by ${diff.toFixed(1)}% since your last check).${context.esc.reset}`;
        }
      }
      if (storageAlert) {
        recommendations.push({ severity: 1, text: storageAlert });
      }

      // B. Battery recommendation
      let batteryAlert = "";
      if (battery.success && battery.health !== 'Unknown') {
        const healthVal = parseFloat(battery.health);
        if (healthVal < 80) {
          batteryAlert = `    ${context.esc.yellow}${context.esc.bold}[WARNING] Battery Degradation Notice:${context.esc.reset}\n`;
          batteryAlert += `    Your battery is currently charging up to a maximum of ${battery.health}% of its original design capacity. Try not to leave it plugged in constantly at 100%.`;
        } else {
          console.log(`\n${context.esc.green}✔ Battery Wear Health: ${battery.health}% (Healthy)${context.esc.reset}`);
        }
      } else if (battery.success) {
        console.log(`\n${context.esc.green}✔ Battery Wear Health: Estimated (${battery.fullCap} Wh capacity)${context.esc.reset}`);
      } else {
        console.log(`\n${context.esc.cyan}i Battery Wear Health: Unknown (Capacity extraction failed)${context.esc.reset}`);
      }
      if (batteryAlert) {
        recommendations.push({ severity: 2, text: batteryAlert });
      }

      // C. Vault Bloat Check
      const backups = listBackups();
      if (backups.length > 0) {
        const vaultBytes = getDirSize(HOLDING_DIR);
        const vaultMB = (vaultBytes / 1024 / 1024).toFixed(1);
        if (parseFloat(vaultMB) > 500) {
          let vaultAlert = `    ${context.esc.yellow}${context.esc.bold}[INFO] Holding Vault Bloat Alert:${context.esc.reset}\n`;
          vaultAlert += `    You currently have ${backups.length} snapshots in your holding vault taking up ${vaultMB} MB of space. Consider running /clean --restore or pruning expired backups to reclaim disk space.`;
          recommendations.push({ severity: 3, text: vaultAlert });
        }
      }

      // D. Temp folder recommendation
      let tempAlert = "";
      if (tempMB > 1024) {
        tempAlert = `    ${context.esc.yellow}${context.esc.bold}[WARNING] Bloated Temporary Cache:${context.esc.reset}\n`;
        tempAlert += `    Your user temporary directories contain ${tempMB.toFixed(1)} MB of files. Run /clean to clear this space.`;
      }
      // Check historical temp trends
      if (lastTrends.length > 0) {
        const prev = lastTrends[lastTrends.length - 1];
        const diff = tempMB - prev.tempMB;
        if (diff > 100) {
          if (!tempAlert) {
            tempAlert = `    ${context.esc.yellow}${context.esc.bold}[INFO] Rapid Temp Cache Growth:${context.esc.reset}\n`;
            tempAlert += `    Your temporary cache is currently small (${tempMB.toFixed(1)} MB), but it is growing quickly.`;
          }
          tempAlert += `\n    ${context.esc.dim}(Note: Your temporary cache grew by ${diff.toFixed(1)} MB since your last check).${context.esc.reset}`;
        }
      }
      if (tempAlert) {
        recommendations.push({ severity: 4, text: tempAlert });
      }

      // E. MySQL service recommendation
      if (mysqlRunning) {
        let mysqlAlert = `    ${context.esc.yellow}${context.esc.bold}[WARNING] Idle Background Services:${context.esc.reset}\n`;
        mysqlAlert += `    MySQL Database server is currently running in the background. If you aren't developing actively, stop it to save RAM.`;
        recommendations.push({ severity: 5, text: mysqlAlert });
      }

      // Output recommendations sorted by severity (rank)
      if (recommendations.length > 0) {
        recommendations.sort((a, b) => a.severity - b.severity);
        recommendations.forEach(r => {
          console.log(`\n${r.text}`);
        });
        console.log(`\n${context.esc.dim}You have ${recommendations.length} recommendations above to optimize your PC.${context.esc.reset}\n`);
      } else {
        console.log(`\n${context.esc.green}✔ No issues detected. Your laptop parameters are in top-tier shape!${context.esc.reset}\n`);
      }
    }
  }
};
