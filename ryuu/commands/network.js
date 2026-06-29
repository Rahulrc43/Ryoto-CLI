const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/network',
  menuName: '📶  Network & Speed Test   ',
  desc: 'Show IPs and run a live internet download speed test in Mbps',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Network diagnostics are currently only optimized for Windows interfaces.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[NETWORK] Retrieving connectivity parameters...${context.esc.reset}\n`);
    
    await context.runTask("Querying IP configuration", async () => {
      const netScript = `
        $activeRoute = Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue | Select-Object -First 1
        $localIp = ""
        $adapterName = ""
        if ($activeRoute) {
            $interfaceIndex = $activeRoute.InterfaceIndex
            $ipObj = Get-NetIPAddress -InterfaceIndex $interfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($ipObj) {
                $localIp = $ipObj.IPAddress
                $adapter = Get-NetAdapter -InterfaceIndex $interfaceIndex -ErrorAction SilentlyContinue
                if ($adapter) { $adapterName = $adapter.InterfaceAlias }
            }
        }
        if (-not $localIp) {
            $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne "127.0.0.1" }
            if ($ips) {
                $localIp = $ips[0].IPAddress
                $adapterName = $ips[0].InterfaceAlias
            }
        }
        if (-not $localIp) { $localIp = "Offline / No Active Adapter" }
        if ($adapterName) {
            Write-Host "Adapter Connected     : $adapterName"
        }
        Write-Host "Local IP Address      : $localIp"
        
        try {
            $publicIp = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing -TimeoutSec 5).Content.Trim()
            Write-Host "Public IP Address     : $publicIp"
        } catch {
            Write-Host "Public IP Address     : Offline / Cannot Connect"
        }
      `;
      const res = await runPowerShellCapture(netScript);
      if (res.stdout) {
        console.log("\n" + res.stdout);
      }
    });

    const runSpeedTest = await context.askQuestion(`${context.esc.bold}Do you want to run a live internet download speed test? (y/n):${context.esc.reset} `);
    if (runSpeedTest.toLowerCase() === 'y' || runSpeedTest.toLowerCase() === 'yes') {
      console.log(`\nRunning download test (downloading 10MB test file from Cloudflare CDN)...`);
      
      const speedOutput = await context.runTask("Testing speed", async () => {
        const speedScript = `
          $url = "https://speed.cloudflare.com/__down?bytes=10485760"
          $tempFile = [System.IO.Path]::GetTempFileName()
          try {
              $time = Measure-Command {
                  Invoke-WebRequest -Uri $url -OutFile $tempFile -UseBasicParsing -TimeoutSec 15
              }
              $seconds = $time.TotalSeconds
              if ($seconds -gt 0) {
                  $speedMbps = [math]::Round((80 / $seconds), 2)
                  Write-Host "SPEED_RESULT:$speedMbps"
              } else {
                  Write-Host "SPEED_RESULT:0"
              }
          } catch {
              Write-Host "SPEED_RESULT:0"
          } finally {
              if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
          }
        `;
        const res = await runPowerShellCapture(speedScript, { timeoutMs: 25000 });
        return res.stdout;
      });

      let speedMbps = 0;
      const m = speedOutput.match(/SPEED_RESULT:([\d\.]+)/);
      if (m) {
        speedMbps = parseFloat(m[1]);
      }
      console.log(`\nSpeed test completed. Download speed: ${context.esc.bold}${speedMbps} Mbps${context.esc.reset}`);
    }
    console.log();
  }
};
