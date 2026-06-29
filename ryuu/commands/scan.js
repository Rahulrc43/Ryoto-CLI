const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/scan',
  menuName: '🛡️   Malware Quick Scan    ',
  desc: 'Run a background security scan using Windows Defender',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Malware scans are only supported on Windows Defender.${context.esc.reset}\n`);
      return;
    }

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
      console.log(`${context.esc.red}✖ Defender Quick Scan failed to complete or was timed out.${context.esc.reset}\n`);
      return;
    }

    if (scanResult.stdout.includes("THREATS_FOUND")) {
      console.log(`\n${context.esc.red}⚠️  WARNING: Windows Defender detected active threats during scan!${context.esc.reset}`);
      const threatLines = scanResult.stdout.split('\n').filter(l => l.startsWith("Threat:"));
      threatLines.forEach(line => console.log(`  ${context.esc.bold}${line.trim()}${context.esc.reset}`));
      console.log(`Please open Windows Security Center immediately to quarantine or remove these threats.\n`);
    } else if (scanResult.stdout.includes("FAILED")) {
      console.log(`${context.esc.red}✖ Defender scan failed: ${scanResult.stdout.replace("FAILED:", "").trim()}${context.esc.reset}\n`);
    } else {
      console.log(`${context.esc.green}✔ Defender Quick Scan finished. Zero threats detected.${context.esc.reset}\n`);
    }
  }
};
