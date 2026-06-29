const os = require('os');
const fs = require('fs');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');

async function getWifiProfiles() {
  const script = `
    netsh wlan show profiles | Select-String "All User Profile" | ForEach-Object { $_.ToString().Split(":")[1].Trim() }
  `;
  const res = await runPowerShellCapture(script);
  return res.stdout.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

async function getWifiPassword(profileName) {
  const tempWifiFile = path.join(os.tmpdir(), 'ryoto-wifi-profile.txt');
  fs.writeFileSync(tempWifiFile, profileName, 'utf8');

  const script = `
    $profile = [System.IO.File]::ReadAllText("${tempWifiFile.replace(/\\/g, '\\\\')}").Trim()
    Remove-Item "${tempWifiFile.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue
    netsh wlan show profile name=$profile key=clear | Select-String "Key Content" | ForEach-Object { $_.ToString().Split(":")[1].Trim() }
  `;
  const res = await runPowerShellCapture(script);
  return res.stdout.replace(/\r/g, '').trim() || "[Open Network / No Password]";
}

module.exports = {
  name: '/wifi',
  menuName: '📶  Wi-Fi Tool            ',
  desc: 'Scan nearby wireless networks and retrieve saved Wi-Fi passwords (masked by default)',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Wi-Fi profiles query is currently only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[WIFI MANAGER] Scanning saved profiles...${context.esc.reset}\n`);
    context.startSpinner("Querying saved profiles");
    const profiles = await getWifiProfiles();
    context.stopSpinner(`Found ${profiles.length} saved profiles.`);

    if (profiles.length === 0) {
      console.log(`${context.esc.red}No profiles found.${context.esc.reset}\n`);
      return;
    }

    console.log(`${context.esc.cyan}┌── SAVED WI-FI PROFILES ─────────────────────────────────────────────┐${context.esc.reset}`);
    profiles.forEach(p => {
      console.log(`  Profile: ${p.padEnd(25)} Password: •••••• [Masked]`);
    });
    console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

    const revealChoice = await context.askQuestion(`Do you want to reveal the plain-text passwords for these networks? (y/n): `);
    
    if (revealChoice.toLowerCase() === 'y' || revealChoice.toLowerCase() === 'yes') {
      console.log(`\nRetrieving passwords...`);
      context.startSpinner("Decrypting profile keys");
      
      const decrypted = [];
      for (const p of profiles) {
        const password = await getWifiPassword(p);
        decrypted.push({ profile: p, password });
      }
      context.stopSpinner("Decrypted credentials");

      console.log(`\n${context.esc.red}${context.esc.bold}⚠️  WARNING: DO NOT SHARE THIS SCREEN ON STREAM OR RECORDING ⚠️${context.esc.reset}`);
      console.log(`${context.esc.cyan}┌── DECRYPTED WI-FI CREDENTIALS ──────────────────────────────────────┐${context.esc.reset}`);
      decrypted.forEach(item => {
        console.log(`  Profile: ${item.profile.padEnd(25)} Password: ${context.esc.bold}${item.password}${context.esc.reset}`);
      });
      console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);
    } else {
      console.log(`\n${context.esc.cyan}Passwords kept masked for security.${context.esc.reset}\n`);
    }
  }
};
