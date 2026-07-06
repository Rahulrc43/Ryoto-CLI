const os = require('os');
const fs = require('fs');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');
const { checkPlatform } = require('../lib/helpers');

module.exports = {
  name: '/battery',
  menuName: '🔋  Battery Report         ',
  desc: 'Generate a detailed HTML battery diagnostics and capacity wear report',
  run: async (context) => {
    if (!checkPlatform(context)) return;

    console.log(`\n${context.esc.yellow}${context.esc.bold}[BATTERY ANALYTICS] Initiating system battery diagnostic...${context.esc.reset}\n`);
    
    const tempReportPath = path.join(os.tmpdir(), 'battery-report-temp.html');
    context.startSpinner("Compiling power logs and battery history");
    
    const res = await runPowerShellCapture(`powercfg /batteryreport /output "${tempReportPath.replace(/\\/g, '\\\\')}"`);
    context.stopSpinner("Diagnostic query complete");

    if (res.code !== 0 || res.stderr.includes("not supported") || !fs.existsSync(tempReportPath)) {
      console.log(`\n${context.esc.red}Error: Battery reporting is not supported on this system.${context.esc.reset}`);
      console.log(`${context.esc.dim}(Note: Desktop PCs without a physical battery do not support powercfg battery analytics.)${context.esc.reset}\n`);
      return;
    }

    let html = "";
    try {
      html = fs.readFileSync(tempReportPath, 'utf8');
    } catch (e) {
      console.error(`Failed to read temporary battery report: ${e.message}`);
      return;
    }

    // Parse design capacity, full charge capacity, and cycle count from HTML report using regex
    const designMatch = html.match(/DESIGN CAPACITY[\s\S]*?([\d,]+)\s*mWh/i);
    const fullMatch = html.match(/FULL CHARGE CAPACITY[\s\S]*?([\d,]+)\s*mWh/i);
    const cycleMatch = html.match(/CYCLE COUNT[\s\S]*?([\d,]+)/i);

    const designCap = designMatch ? parseInt(designMatch[1].replace(/,/g, ''), 10) : null;
    const fullCap = fullMatch ? parseInt(fullMatch[1].replace(/,/g, ''), 10) : null;
    const cycles = cycleMatch ? parseInt(cycleMatch[1].replace(/,/g, ''), 10) : 0;

    console.log(`${context.esc.cyan}┌── BATTERY HEALTH SUMMARY ──────────────────────────────────────────┐${context.esc.reset}`);
    if (designCap && fullCap) {
      const healthPct = ((fullCap / designCap) * 100).toFixed(1);
      console.log(`  Design Capacity      : ${context.esc.bold}${designCap.toLocaleString()} mWh${context.esc.reset}`);
      console.log(`  Full Charge Capacity : ${context.esc.bold}${fullCap.toLocaleString()} mWh${context.esc.reset}`);
      console.log(`  Battery Health State : ${context.esc.bold}${healthPct}%${context.esc.reset}`);
      console.log(`  Total Cycle Count    : ${context.esc.bold}${cycles}${context.esc.reset} cycles`);
    } else {
      console.log(`  Battery status query succeeded, but health data could not be parsed.`);
      console.log(`  Please check the full report for details.`);
    }
    console.log(`${context.esc.cyan}└────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    const openReport = await context.askQuestion(`Do you want to open the detailed battery report in your browser? (y/n): `);
    if (openReport.toLowerCase() === 'y' || openReport.toLowerCase() === 'yes') {
      const desktopDir = path.join(os.homedir(), 'Desktop');
      const targetDir = fs.existsSync(desktopDir) ? desktopDir : os.homedir();
      const finalReportPath = path.join(targetDir, 'Ryoto-Battery-Report.html');
      
      try {
        fs.copyFileSync(tempReportPath, finalReportPath);
        
        // Auto-reveal in explorer
        const { revealInExplorer } = require('../lib/helpers');
        revealInExplorer(finalReportPath);

        // Open in default browser
        const { spawn } = require('child_process');
        spawn('cmd.exe', ['/c', 'start', '', finalReportPath], { detached: true, stdio: 'ignore' }).unref();
        
        console.log(`${context.esc.green}✔ Opened detailed report and saved copy to Desktop.${context.esc.reset}\n`);
      } catch (err) {
        console.error(`${context.esc.red}Failed to export report: ${err.message}${context.esc.reset}\n`);
      }
    }

    // Cleanup temp file
    try {
      if (fs.existsSync(tempReportPath)) {
        fs.unlinkSync(tempReportPath);
      }
    } catch (e) {}
  }
};
