const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/ports',
  menuName: '🔌  Open Ports Scan       ',
  desc: 'Scan active listening TCP ports and view their owning processes',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Listening port scanning is currently only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[PORTS SCAN] Querying active listening TCP ports...${context.esc.reset}\n`);
    
    const result = await context.runTask("Scanning active TCP connections", async () => {
      const portsScript = `
        $connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
        Write-Host "┌── ACTIVE LISTENING PORTS ──────────────────────────────────────────┐"
        Write-Host "  Port     Process Name           PID       Protocol"
        Write-Host "  ────     ────────────           ───       ────────"
        $printed = @{}
        foreach ($c in ($connections | Sort-Object LocalPort)) {
            $port = $c.LocalPort
            if ($printed.ContainsKey($port)) { continue }
            $printed[$port] = $true
            $owningPid = $c.OwningProcess
            $procName = (Get-Process -Id $owningPid -ErrorAction SilentlyContinue).Name
            if (-not $procName) { $procName = "System/Unknown" }
            Write-Host "  $($port.ToString().PadRight(8)) $($procName.PadRight(22)) $($owningPid.ToString().PadRight(9)) TCP"
        }
        Write-Host "└────────────────────────────────────────────────────────────────────┘"
      `;
      const res = await runPowerShellCapture(portsScript);
      return res.stdout;
    });

    if (result) {
      console.log(result);
    }
    console.log();
  }
};
