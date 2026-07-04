const os = require('os');
const fs = require('fs');
const path = require('path');
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
        $items = @()
        $printed = @{}
        foreach ($c in ($connections | Sort-Object LocalPort)) {
            $port = $c.LocalPort
            if ($printed.ContainsKey($port)) { continue }
            $printed[$port] = $true
            $owningPid = $c.OwningProcess
            $procName = (Get-Process -Id $owningPid -ErrorAction SilentlyContinue).Name
            if (-not $procName) { $procName = "System/Unknown" }
            $items += [PSCustomObject]@{
                Port = $port
                ProcessName = $procName
                Pid = $owningPid
                Protocol = "TCP"
            }
        }
        $items | ConvertTo-Json
      `;
      const res = await runPowerShellCapture(portsScript);
      return res.stdout;
    });

    let portsList = [];
    try {
      if (result) {
        portsList = JSON.parse(result);
        if (!Array.isArray(portsList)) {
          portsList = [portsList];
        }
      }
    } catch (e) {}

    if (portsList.length === 0) {
      console.log(`${context.esc.green}✔ No listening TCP ports detected.${context.esc.reset}\n`);
      return;
    }

    const FLAGGED_PORTS = {
      21: "FTP Plaintext (Credential exposure)",
      23: "Telnet Unencrypted (High shell risk)",
      25: "SMTP Mail Server (Spam relay risk)",
      135: "RPC Endpoint (NetBIOS exploit target)",
      139: "NetBIOS Service (SMB exploit target)",
      445: "SMB Direct (EternalBlue/Ransomware target)",
      1080: "SOCKS Proxy (Potential proxy trojan)",
      3128: "Squid Proxy (Verify unauthorized traffic)",
      3389: "RDP Remote Desktop (Brute-force exposure)",
      4444: "Metasploit shell (HIGH SUSPICION)",
      5900: "VNC Server (Remote control access risk)",
      5901: "VNC Display 1 (Remote control access risk)",
      6667: "IRC Channel (Botnet command risk)",
      31337: "Back Orifice Trojan (HIGH SUSPICION)"
    };

    let suspiciousCount = 0;

    console.log(`${context.esc.cyan}┌── ACTIVE LISTENING PORTS ─────────────────────────────────────────────────────────────┐${context.esc.reset}`);
    console.log(`  ${'Port'.padEnd(8)} ${'Process Name'.padEnd(20)} ${'PID'.padEnd(8)} ${'Protocol'.padEnd(8)} ${'Security Flag'}`);
    console.log(`  ${'────'.padEnd(8)} ${'────────────'.padEnd(20)} ${'───'.padEnd(8)} ${'────────'.padEnd(8)} ${'─────────────'}`);

    portsList.forEach(p => {
      const port = p.Port;
      const proc = p.ProcessName.length > 18 ? p.ProcessName.slice(0, 15) + "..." : p.ProcessName;
      const pid = p.Pid.toString();
      const proto = p.Protocol;
      
      let flag = `${context.esc.green}Safe (Clear)${context.esc.reset}`;
      if (FLAGGED_PORTS[port]) {
        suspiciousCount++;
        const severityColor = (port === 4444 || port === 31337) ? context.esc.red + context.esc.bold : context.esc.yellow + context.esc.bold;
        flag = `${severityColor}[WARNING: ${FLAGGED_PORTS[port]}]${context.esc.reset}`;
      }
      
      console.log(`  ${port.toString().padEnd(8)} ${proc.padEnd(20)} ${pid.padEnd(8)} ${proto.padEnd(8)} ${flag}`);
    });
    console.log(`${context.esc.cyan}└───────────────────────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    if (suspiciousCount > 0) {
      console.log(`${context.esc.red}⚠️  WARNING: Detected ${suspiciousCount} suspicious or high-risk open ports listening on your network!${context.esc.reset}`);
      console.log(`${context.esc.yellow}💡 Recommendation: If you do not recognize these processes or did not configure these services, consider terminating them immediately.${context.esc.reset}\n`);
    }

    const killChoice = await context.askQuestion(`Do you want to terminate the process owning a specific port? (y/n): `);
    if (killChoice.toLowerCase() === 'y' || killChoice.toLowerCase() === 'yes') {
      const portInput = await context.askQuestion(`Enter the port number to terminate: `);
      const portNum = parseInt(portInput.trim());
      if (isNaN(portNum)) {
        console.log(`${context.esc.red}Invalid port number.${context.esc.reset}\n`);
        return;
      }

      console.log(`\nAttempting to terminate process on port ${portNum}...`);
      
      const tempKillFile = path.join(os.tmpdir(), 'ryoto-kill-port.txt');
      fs.writeFileSync(tempKillFile, JSON.stringify({ port: portNum }), 'utf8');

      const killScript = `
        $data = Get-Content "${tempKillFile.replace(/\\/g, '\\\\')}" -Raw | ConvertFrom-Json
        Remove-Item "${tempKillFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
        $targetPort = $data.port
        
        $conn = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            $owningPid = $conn.OwningProcess
            if ($owningPid -eq 4 -or $owningPid -eq 0) {
                Write-Host "FAILED:CRITICAL_SYSTEM:PID $owningPid is the Windows System Kernel. Terminating it is blocked to prevent a system crash (BSOD)."
            } else {
                $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
                if ($proc) {
                    $name = $proc.Name
                    $criticalList = @("svchost", "lsass", "wininit", "services", "smss", "csrss", "System", "Idle")
                    if ($criticalList -contains $name) {
                        Write-Host "FAILED:CRITICAL_SYSTEM:$name is a critical Windows system service. Terminating it is blocked to prevent a system crash."
                    } else {
                        try {
                            Stop-Process -Id $owningPid -Force -ErrorAction Stop
                            Write-Host "SUCCESS:$($name):$($owningPid)"
                        } catch {
                            Write-Host "FAILED:Access denied. Run Ryoto as Administrator to kill this process."
                        }
                    }
                } else {
                    Write-Host "FAILED:Process with PID $owningPid not found."
                }
            }
        } else {
            Write-Host "FAILED:No active listening connection found on port $targetPort."
        }
      `;

      context.startSpinner("Stopping process");
      const res = await runPowerShellCapture(killScript);
      context.stopSpinner("Done");

      if (res.stdout.includes("SUCCESS")) {
        const m = res.stdout.match(/SUCCESS:([^:]+):(\d+)/);
        if (m) {
          console.log(`${context.esc.green}✔ Successfully terminated process "${m[1]}" (PID: ${m[2]}) on port ${portNum}!${context.esc.reset}\n`);
        } else {
          console.log(`${context.esc.green}✔ Process terminated successfully.${context.esc.reset}\n`);
        }
      } else if (res.stdout.includes("CRITICAL_SYSTEM")) {
        const msg = res.stdout.substring(res.stdout.indexOf("CRITICAL_SYSTEM:") + 16).trim();
        console.log(`${context.esc.red}✖ Safety Block: ${msg}${context.esc.reset}\n`);
      } else {
        const errMsg = res.stdout.replace("FAILED:", "").trim() || "Failed to terminate process.";
        console.log(`${context.esc.red}✖ ${errMsg}${context.esc.reset}\n`);
      }
    }
  }
};
