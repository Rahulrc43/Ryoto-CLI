const fs = require('fs');
const path = require('path');
const os = require('os');
const { runPowerShellCapture } = require('./shell');

async function getBatteryStatus() {
  const tempPath = path.join(os.tmpdir(), 'battery-report-cli.html');
  
  // Clean up any old report first
  try { fs.unlinkSync(tempPath); } catch (e) {}

  // Generate the report via powercfg
  const res = await runPowerShellCapture(`powercfg /batteryreport /output "${tempPath.replace(/\\/g, '\\\\')}"`);
  
  if (!fs.existsSync(tempPath)) {
    return { success: false, health: "Unknown", fullCap: 0, designCap: 0, designCapStr: "Unknown" };
  }

  try {
    const html = fs.readFileSync(tempPath, 'utf8');
    
    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch (e) {}

    // Match capacities via Node regex
    const designMatch = html.match(/DESIGN CAPACITY.*?([\d,]+)\s*mWh/i);
    const fullMatch = html.match(/FULL CHARGE CAPACITY.*?([\d,]+)\s*mWh/i);

    if (designMatch && fullMatch) {
      const designCap = parseInt(designMatch[1].replace(/,/g, ''));
      const fullCap = parseInt(fullMatch[1].replace(/,/g, ''));

      if (designCap > 0 && fullCap > 0) {
        const health = parseFloat(((fullCap / designCap) * 100).toFixed(1));
        return {
          success: true,
          health,
          fullCap: parseFloat((fullCap / 1000).toFixed(1)),
          designCap: parseFloat((designCap / 1000).toFixed(1)),
          designCapStr: `${(designCap / 1000).toFixed(1)} Wh`
        };
      }
    } else if (designMatch) {
      const designCap = parseInt(designMatch[1].replace(/,/g, ''));
      if (designCap > 0) {
        return {
          success: true,
          health: "Unknown",
          fullCap: 0,
          designCap: parseFloat((designCap / 1000).toFixed(1)),
          designCapStr: `${(designCap / 1000).toFixed(1)} Wh`
        };
      }
    }
  } catch (e) {}

  return { success: false, health: "Unknown", fullCap: 0, designCap: 0, designCapStr: "Unknown" };
}

module.exports = { getBatteryStatus };
