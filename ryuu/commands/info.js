const os = require('os');
const { getBatteryStatus } = require('../lib/battery');

module.exports = {
  name: '/info',
  menuName: '📊  Hardware Diagnostics  ',
  desc: 'View detailed CPU, GPU, 144Hz display, and battery health specs',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.cyan}┌── SYSTEM SPECIFICATIONS ─────────────────────────────────────────────┐${context.esc.reset}`);
      console.log(`  OS Platform  : ${os.type()} (${os.release()} ${os.arch()})`);
      console.log(`  CPU Cores    : ${os.cpus()[0].model} (${os.cpus().length} Logical Cores)`);
      console.log(`  Physical RAM : ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`);
      console.log(`  Free RAM     : ${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB`);
      console.log(`${context.esc.cyan}└──────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[DIAGNOSTICS] Extracting hardware specifications...${context.esc.reset}\n`);
    const infoScript = `
      $cs = Get-CimInstance -ClassName Win32_ComputerSystem
      $os = Get-CimInstance -ClassName Win32_OperatingSystem
      $cpu = Get-CimInstance -ClassName Win32_Processor
      $gpu = Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1
      $disks = Get-PhysicalDisk | Select-Object FriendlyName, MediaType, Size

      $memDevices = Get-CimInstance -ClassName Win32_PhysicalMemory -ErrorAction SilentlyContinue
      $memSpeed = 0
      $memType = "DDR"
      if ($memDevices) {
          $firstStick = $memDevices | Select-Object -First 1
          $memSpeed = $firstStick.Speed
          $smType = $firstStick.SMBIOSMemoryType
          if ($smType -eq 26) { $memType = "DDR4" }
          elseif ($smType -eq 34) { $memType = "DDR5" }
          elseif ($smType -eq 24) { $memType = "DDR3" }
      }

      Write-Host "┌── SYSTEM SPECIFICATIONS ─────────────────────────────────────────────┐" -ForegroundColor Cyan
      Write-Host "  Laptop Model : $($cs.Manufacturer) $($cs.Model)"
      Write-Host "  OS Version   : $($os.Caption) ($($os.Version) x64)"
      Write-Host "  Processor    : $($cpu.Name) ($($cpu.NumberOfCores) Cores / $($cpu.NumberOfLogicalProcessors) Threads)"
      if ($memSpeed -gt 0) {
          Write-Host "  Physical RAM : $([math]::Round($cs.TotalPhysicalMemory / 1GB, 1)) GB $memType @ $memSpeed MHz"
      } else {
          Write-Host "  Physical RAM : $([math]::Round($cs.TotalPhysicalMemory / 1GB, 1)) GB"
      }
      Write-Host "  GPU model    : $($gpu.Name) ($([math]::Round($gpu.AdapterRAM / 1GB, 0)) GB VRAM)"
      Write-Host "  Display      : $($gpu.CurrentHorizontalResolution)x$($gpu.CurrentVerticalResolution) @ $($gpu.CurrentRefreshRate)Hz refresh rate"
      Write-Host "  Primary SSD  : $($disks.FriendlyName) ($([math]::Round($disks.Size / 1GB, 0)) GB)"
    `;
    await context.runPowerShell(infoScript);

    // Call shared Node WMI battery helper
    const battery = await getBatteryStatus();
    if (battery.success) {
      const color = (battery.health !== 'Unknown' && parseFloat(battery.health) > 80) ? context.esc.green : context.esc.yellow;
      console.log(`  Battery Wear : Health at ${color}${battery.health}%${context.esc.reset} (${battery.fullCap} Wh charge / ${battery.designCapStr} design)`);
    } else {
      console.log(`  Battery Wear : Unknown (Capacity extraction failed)`);
    }

    console.log(`${context.esc.cyan}└──────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);
  }
};
