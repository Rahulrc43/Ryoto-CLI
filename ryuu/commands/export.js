const fs = require('fs');
const path = require('path');
const os = require('os');
const { getBatteryStatus } = require('../lib/battery');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/export',
  menuName: '💾  Export Diagnostic Report',
  desc: 'Export system information and advisor recommendations to a Markdown/HTML/JSON report file',
  run: async (context, args = []) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Export reports are currently only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    const isJson = args.includes('--json') || args.includes('-j');
    
    if (!isJson) {
      console.log(`\n${context.esc.yellow}${context.esc.bold}[EXPORT] Compiling full diagnostics snapshot...${context.esc.reset}\n`);
      context.startSpinner("Compiling report data");
    }

    const exportScript = `
      $cs = Get-CimInstance -ClassName Win32_ComputerSystem
      $os = Get-CimInstance -ClassName Win32_OperatingSystem
      $cpu = Get-CimInstance -ClassName Win32_Processor
      $gpu = Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1
      $disks = Get-PhysicalDisk | Select-Object FriendlyName, MediaType, Size
      
      $systemDrive = $env:SystemDrive.Replace(":", "")
      $drive = Get-PSDrive $systemDrive
      $freePct = [math]::Round(($drive.Free / ($drive.Free + $drive.Used)) * 100, 1)

      $mysql = Get-Service -Name "MySQL80" -ErrorAction SilentlyContinue
      $mysqlRunning = $mysql -and $mysql.Status -eq "Running"

      $tempSize = 0
      if (Test-Path $env:TEMP) {
          $tempSize = (Get-ChildItem -Path $env:TEMP -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
      }

      # Return report variables
      Write-Host "MODEL:$($cs.Manufacturer) $($cs.Model)"
      Write-Host "OS:$($os.Caption) ($($os.Version) x64)"
      Write-Host "CPU:$($cpu.Name) ($($cpu.NumberOfCores) Cores)"
      Write-Host "RAM:$([math]::Round($cs.TotalPhysicalMemory / 1GB, 1)) GB"
      Write-Host "GPU:$($gpu.Name)"
      Write-Host "DISKS:$($disks.FriendlyName) ($([math]::Round($disks.Size / 1GB, 0)) GB)"
      Write-Host "DISK_PCT:$($freePct)"
      Write-Host "MYSQL:$($mysqlRunning)"
      Write-Host "TEMP_MB:$([math]::Round($tempSize, 1))"
    `;

    const res = await runPowerShellCapture(exportScript);
    const exportOutput = res.stdout;

    // Get WMI battery diagnostics from shared Node helper
    const battery = await getBatteryStatus();

    if (!isJson) {
      context.stopSpinner("Diagnostics compiled");
    }

    // Parse variables
    const lines = exportOutput.replace(/\r/g, '').split('\n');
    const data = {};
    lines.forEach(l => {
      const idx = l.indexOf(':');
      if (idx > 0) {
        const key = l.substring(0, idx).trim();
        const val = l.substring(idx + 1).trim();
        data[key] = val;
      }
    });

    if (isJson) {
      const jsonReport = {
        timestamp: new Date().toISOString(),
        model: data['MODEL'] || 'Unknown',
        os: data['OS'] || 'Unknown',
        cpu: data['CPU'] || 'Unknown',
        ram: data['RAM'] || 'Unknown',
        gpu: data['GPU'] || 'Unknown',
        disk: data['DISKS'] || 'Unknown',
        disk_pct: data['DISK_PCT'] ? parseFloat(data['DISK_PCT']) : null,
        mysql: data['MYSQL'] === 'True',
        temp_mb: data['TEMP_MB'] ? parseFloat(data['TEMP_MB']) : null,
        battery: battery.success ? {
          health: battery.health,
          full_capacity_wh: battery.fullCap,
          design_capacity: battery.designCapStr
        } : null
      };
      console.log(JSON.stringify(jsonReport, null, 2));
      return;
    }

    // Build Markdown & HTML report files
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = `ryoto-report-${timestamp}.md`;
    const reportHtmlname = `ryoto-report-${timestamp}.html`;
    const reportPath = path.join(process.cwd(), reportFilename);
    const reportHtmlPath = path.join(process.cwd(), reportHtmlname);

    // 1. Markdown content
    let md = `# Ryoto Diagnostic Report 🐉\n`;
    md += `**Generated on:** ${new Date().toLocaleString()}\n`;
    md += `**Platform:** ${os.type()} (${os.release()} ${os.arch()})\n\n`;

    md += `## 📊 Hardware Specifications\n`;
    md += `* **Model:** ${data['MODEL'] || 'Unknown'}\n`;
    md += `* **OS Version:** ${data['OS'] || 'Unknown'}\n`;
    md += `* **Processor:** ${data['CPU'] || 'Unknown'}\n`;
    md += `* **Physical RAM:** ${data['RAM'] || 'Unknown'}\n`;
    md += `* **GPU:** ${data['GPU'] || 'Unknown'}\n`;
    md += `* **Primary SSD:** ${data['DISKS'] || 'Unknown'}\n\n`;

    if (battery.success) {
      md += `## 🔋 Battery Health\n`;
      md += `* **Health Capacity:** ${battery.health}%\n`;
      md += `* **Full Charged Capacity:** ${battery.fullCap} Wh\n`;
      md += `* **Design Capacity:** ${battery.designCapStr}\n\n`;
    }

    md += `## 🤖 Advisor Recommendations\n`;
    let suggestions = 0;
    
    if (data['DISK_PCT'] && parseFloat(data['DISK_PCT']) < 15) {
      suggestions++;
      md += `* **[!] Low Disk Space Alert:** Your C:\\ drive has only ${data['DISK_PCT']}% free space left. Running \`/clean\` or clearing large directories via \`/disk\` is highly recommended.\n`;
    }
    if (battery.success && battery.health !== 'Unknown' && parseFloat(battery.health) < 80) {
      suggestions++;
      md += `* **[!] Battery Degradation Notice:** Your battery health is at ${battery.health}%. Try not to leave it plugged in constantly at 100%.\n`;
    }
    if (data['MYSQL'] === 'True') {
      suggestions++;
      md += `* **[!] Idle Background Services:** MySQL Database server is currently running in the background, consuming RAM. Consider setting it to manual startup.\n`;
    }
    if (data['TEMP_MB'] && parseFloat(data['TEMP_MB']) > 1024) {
      suggestions++;
      md += `* **[!] Bloated Temporary Cache:** Your temporary directory contains ${data['TEMP_MB']} MB of cache files. Run \`/clean\` to clear this space.\n`;
    }

    if (suggestions === 0) {
      md += `* **✔ No issues detected.** Your laptop parameters are in top-tier shape!\n`;
    }

    // 2. HTML content (dark mode)
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Ryoto Diagnostic Report</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #c9d1d9; margin: 40px; }
    .container { max-width: 800px; margin: 0 auto; background-color: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    h1 { color: #58a6ff; border-bottom: 1px solid #21262d; padding-bottom: 8px; margin-top: 0; }
    h2 { color: #ff7b72; margin-top: 24px; border-bottom: 1px solid #21262d; padding-bottom: 6px; }
    ul { line-height: 1.6; padding-left: 20px; }
    li { margin-bottom: 8px; }
    .meta { color: #8b949e; font-size: 14px; margin-bottom: 24px; background-color: #0d1117; padding: 12px; border-radius: 4px; border: 1px solid #21262d; }
    .success { color: #7ee787; font-weight: bold; }
    .warning { color: #f2cc60; font-weight: bold; }
    .critical { color: #ff7b72; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Ryoto Diagnostic Report 🐉</h1>
    <div class="meta">
      <strong>Generated on:</strong> ${new Date().toLocaleString()}<br>
      <strong>Platform:</strong> ${os.type()} (${os.release()} ${os.arch()})
    </div>
    
    <h2>📊 Hardware Specifications</h2>
    <ul>
      <li><strong>Model:</strong> ${data['MODEL'] || 'Unknown'}</li>
      <li><strong>OS Version:</strong> ${data['OS'] || 'Unknown'}</li>
      <li><strong>Processor:</strong> ${data['CPU'] || 'Unknown'}</li>
      <li><strong>Physical RAM:</strong> ${data['RAM'] || 'Unknown'}</li>
      <li><strong>GPU:</strong> ${data['GPU'] || 'Unknown'}</li>
      <li><strong>Primary SSD:</strong> ${data['DISKS'] || 'Unknown'}</li>
    </ul>

    <h2>🔋 Battery Health</h2>
    <ul>
      <li><strong>Health Capacity:</strong> ${battery.success ? battery.health + '%' : 'Unknown'}</li>
      <li><strong>Full Charged Capacity:</strong> ${battery.success ? battery.fullCap + ' Wh' : 'Unknown'}</li>
      <li><strong>Design Capacity:</strong> ${battery.success ? battery.designCapStr : 'Unknown'}</li>
    </ul>

    <h2>🤖 Advisor Recommendations</h2>
    <ul>
`;
    
    let hasAlerts = false;
    if (data['DISK_PCT'] && parseFloat(data['DISK_PCT']) < 15) {
      hasAlerts = true;
      html += `      <li><span class="critical">[!] Low Disk Space Alert:</span> Your C:\\ drive has only ${data['DISK_PCT']}% free space left. Running /clean or /disk is highly recommended.</li>\n`;
    }
    if (battery.success && battery.health !== 'Unknown' && parseFloat(battery.health) < 80) {
      hasAlerts = true;
      html += `      <li><span class="warning">[!] Battery Degradation Notice:</span> Your battery health is at ${battery.health}%. Try not to leave it plugged in constantly at 100%.</li>\n`;
    }
    if (data['MYSQL'] === 'True') {
      hasAlerts = true;
      html += `      <li><span class="warning">[!] Idle Background Services:</span> MySQL Database server is currently running in the background, consuming RAM.</li>\n`;
    }
    if (data['TEMP_MB'] && parseFloat(data['TEMP_MB']) > 1024) {
      hasAlerts = true;
      html += `      <li><span class="warning">[!] Bloated Temporary Cache:</span> Your temporary directory contains ${data['TEMP_MB']} MB of cache. Run /clean.</li>\n`;
    }

    if (!hasAlerts) {
      html += `      <li><span class="success">✔ No issues detected.</span> Your laptop parameters are in top-tier shape!</li>\n`;
    }

    html += `    </ul>
  </div>
</body>
</html>`;

    // Write to files
    fs.writeFileSync(reportPath, md, 'utf8');
    fs.writeFileSync(reportHtmlPath, html, 'utf8');

    console.log(`${context.esc.green}✔ Diagnostic reports successfully generated:${context.esc.reset}`);
    console.log(`  📄 Markdown: ${context.esc.bold}${reportPath}${context.esc.reset}`);
    console.log(`  📄 HTML    : ${context.esc.bold}${reportHtmlPath}${context.esc.reset}\n`);
  }
};
