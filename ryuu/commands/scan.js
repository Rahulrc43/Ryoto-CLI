const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/scan',
  menuName: '🛡️   Malware Quick Scan    ',
  desc: 'Scan for malware using Windows Defender or Microsoft Malicious Software Removal Tool (MRT)',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Malware scans are only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.cyan}┌── MALWARE SCANNING OPTIONS ────────────────────────────────────────┐${context.esc.reset}`);
    console.log(`  [1] Windows Defender Quick Scan (Background PowerShell)`);
    console.log(`  [2] Windows Malicious Software Removal Tool (MRT - Interactive GUI)`);
    console.log(`  [3] Windows Malicious Software Removal Tool (MRT - Quiet Background Scan)`);
    console.log(`${context.esc.cyan}└────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    const selection = await context.askQuestion(`Select scan option (1-3) [default: 1]: `);
    const opt = selection.trim();

    if (opt === '2') {
      console.log(`\n${context.esc.yellow}Launching Microsoft Malicious Software Removal Tool GUI...${context.esc.reset}`);
      console.log(`${context.esc.yellow}💡 Tip: Windows will show a UAC prompt. Please approve the flashing prompt on your screen.${context.esc.reset}\n`);
      
      const script = `
        try {
            Start-Process -FilePath "mrt.exe" -ErrorAction Stop
            Write-Host "SUCCESS"
        } catch {
            Write-Host "FAILED: $_"
        }
      `;
      const res = await runPowerShellCapture(script);
      if (res.stdout.includes("SUCCESS")) {
        console.log(`${context.esc.green}✔ MRT Window opened successfully.${context.esc.reset}\n`);
      } else {
        const errMsg = res.stdout.replace("FAILED:", "").trim();
        console.log(`${context.esc.red}✖ Failed to launch MRT: ${errMsg}${context.esc.reset}`);
        if (errMsg.includes("UnauthorizedAccessException") || errMsg.toLowerCase().includes("access denied")) {
          console.log(`${context.esc.yellow}💡 Tip: Launching MRT requires Administrator privileges. Please run Ryoto as Administrator.${context.esc.reset}`);
        }
        console.log();
      }
      return;
    }

    if (opt === '3') {
      console.log(`\n${context.esc.yellow}${context.esc.bold}[SECURITY SCAN] Triggering MRT Quiet Background Scan...${context.esc.reset}\n`);
      console.log(`${context.esc.yellow}💡 Tip: Background scans require Administrator privileges. Please approve UAC if prompted.${context.esc.reset}\n`);

      const scanResult = await context.runTask("Running background MRT scan", async () => {
        const script = `
          try {
              Start-Process -FilePath "mrt.exe" -ArgumentList "/q /t" -Wait -ErrorAction Stop
              Write-Host "SUCCESS"
          } catch {
              Write-Host "FAILED: $_"
          }
        `;
        const res = await runPowerShellCapture(script, { timeoutMs: 300000 }); // 5 minutes timeout for MRT background scan
        return res;
      });

      if (!scanResult || !scanResult.success) {
        console.log(`${context.esc.red}✖ MRT Background Scan failed to complete or timed out.${context.esc.reset}\n`);
        return;
      }

      if (scanResult.stdout.includes("SUCCESS")) {
        console.log(`${context.esc.green}✔ MRT Background Scan completed successfully.${context.esc.reset}\n`);
      } else {
        const errMsg = scanResult.stdout.replace("FAILED:", "").trim();
        console.log(`${context.esc.red}✖ MRT scan failed: ${errMsg}${context.esc.reset}`);
        if (errMsg.includes("UnauthorizedAccessException") || errMsg.toLowerCase().includes("access denied")) {
          console.log(`${context.esc.yellow}💡 Tip: Background scans require Administrator privileges. Please run Ryoto as Administrator.${context.esc.reset}`);
        }
        console.log();
      }
      return;
    }

    // Default to Defender Quick Scan
    console.log(`\n${context.esc.yellow}${context.esc.bold}[SECURITY SCAN] Triggering Windows Defender scan...${context.esc.reset}\n`);
    
    const scanResult = await context.runTask("Scanning for malware", async () => {
      const script = `
        $before = Get-Date
        try {
            Start-MpScan -ScanType QuickScan -ErrorAction Stop
            $threats = Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object { $_.InitialDetectionTime -ge $before }
            if ($threats) {
                Write-Host "THREATS_FOUND"
                $threats | ForEach-Object { Write-Host "Threat: $($_.ThreatName)" }
            } else {
                Write-Host "CLEAN"
            }
        } catch {
            Write-Host "FAILED: $_"
        }
      `;
      const res = await runPowerShellCapture(script, { timeoutMs: 180000 }); // 3 minute scan timeout
      return res;
    });

    if (!scanResult || !scanResult.success) {
      console.log(`${context.esc.red}✖ Defender Quick Scan failed to complete or timed out.${context.esc.reset}\n`);
      return;
    }

    if (scanResult.stdout.includes("THREATS_FOUND")) {
      console.log(`\n${context.esc.red}⚠️  WARNING: Windows Defender detected active threats during scan!${context.esc.reset}`);
      const threatLines = scanResult.stdout.split('\n').filter(l => l.startsWith("Threat:"));
      threatLines.forEach(line => console.log(`  ${context.esc.bold}${line.trim()}${context.esc.reset}`));
      console.log(`Please open Windows Security Center immediately to quarantine or remove these threats.\n`);
    } else if (scanResult.stdout.includes("FAILED")) {
      const errMsg = scanResult.stdout.replace("FAILED:", "").trim();
      console.log(`${context.esc.red}✖ Defender scan failed: ${errMsg}${context.esc.reset}`);
      if (errMsg.includes("UnauthorizedAccessException") || errMsg.toLowerCase().includes("access denied") || errMsg.toLowerCase().includes("permission")) {
        console.log(`${context.esc.yellow}💡 Tip: Malware scans require Administrator privileges. Please run your terminal/Ryoto as Administrator.${context.esc.reset}`);
      }
      console.log();
    } else {
      console.log(`${context.esc.green}✔ Defender Quick Scan finished. Zero threats detected.${context.esc.reset}\n`);
    }
  }
};
