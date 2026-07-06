const os = require('os');
const fs = require('fs');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');

async function getWifiProfiles() {
  const script = `
    netsh wlan show profiles | Select-String "All User Profile" | ForEach-Object { $p = $_.ToString().Split(":"); if ($p.Length -gt 1) { $p[1].Trim() } }
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
    netsh wlan show profile name=$profile key=clear | Select-String "Key Content" | ForEach-Object { $p = $_.ToString().Split(":"); if ($p.Length -gt 1) { $p[1].Trim() } }
  `;
  const res = await runPowerShellCapture(script);
  return res.stdout.replace(/\r/g, '').trim() || "[Open Network / No Password]";
}

// Scrambles text and locks characters into "•••••• [Masked]" (Encrypting Animation)
async function animateEncryptText(label, finalMask, esc, delayMs = 15) {
  const chars = "$%#@!&*+=?abcdefghijklmnopqrstuvwxyz0123456789";
  const length = finalMask.length;
  
  for (let step = 0; step <= 8; step++) {
    let scrambled = "";
    for (let i = 0; i < length; i++) {
      if (Math.random() < step / 8) {
        scrambled += finalMask[i];
      } else {
        scrambled += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    process.stdout.write(`\r  ${label} ${esc.dim}${scrambled}${esc.reset}\x1b[K`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  process.stdout.write(`\r  ${label} ${esc.dim}${finalMask}${esc.reset}\x1b[K\n`);
}

// Retro-hacking text decrypting transition to reveal plain-text password
async function animateDecryptText(label, finalValue, esc, delayMs = 15) {
  const chars = "$%#@!&*+=?abcdefghijklmnopqrstuvwxyz0123456789";
  const length = finalValue.length;
  let revealed = "";
  
  for (let i = 0; i < length; i++) {
    for (let frame = 0; frame < 3; frame++) {
      let scrambledRemaining = "";
      for (let j = i; j < length; j++) {
        scrambledRemaining += chars[Math.floor(Math.random() * chars.length)];
      }
      const currentGuess = revealed + scrambledRemaining;
      process.stdout.write(`\r  ${label} ${esc.bold}${currentGuess}${esc.reset}\x1b[K`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    revealed += finalValue[i];
  }
  process.stdout.write(`\r  ${label} ${esc.bold}${finalValue}${esc.reset}\x1b[K\n`);
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
    for (const p of profiles) {
      const label = `Profile: ${p.padEnd(25)} Password:`;
      await animateEncryptText(label, "•••••• [Masked]", context.esc);
    }
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
      for (const item of decrypted) {
        const label = `Profile: ${item.profile.padEnd(25)} Password:`;
        await animateDecryptText(label, item.password, context.esc);
      }
      console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);
    } else {
      console.log(`\n${context.esc.cyan}Passwords kept masked for security.${context.esc.reset}\n`);
    }

    const qrShare = await context.askQuestion(`Would you like to generate a Wi-Fi Sharing QR Code for one of these networks? (y/n): `);
    if (qrShare.toLowerCase() === 'y' || qrShare.toLowerCase() === 'yes') {
      console.log(`\nAvailable profiles:`);
      profiles.forEach((p, index) => {
        console.log(`  [${index + 1}] ${p}`);
      });
      
      const choice = await context.askQuestion(`\nSelect profile number to share (1-${profiles.length}): `);
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < profiles.length) {
        const ssid = profiles[idx];
        context.startSpinner(`Decrypting profile key for "${ssid}"`);
        const password = await getWifiPassword(ssid);
        context.stopSpinner("Ready");

        const desktopDir = path.join(os.homedir(), 'Desktop');
        const targetDir = fs.existsSync(desktopDir) ? desktopDir : os.homedir();
        const cleanSsid = ssid.replace(/[^a-zA-Z0-9]/g, '_');
        const qrPath = path.join(targetDir, `Ryoto-WiFi-QR-${cleanSsid}.html`);

        const isNopass = password === "[Open Network / No Password]";
        const authType = isNopass ? "nopass" : "WPA";
        const cleanPassword = isNopass ? "" : password;
        
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Ryoto Wi-Fi QR Code Sharer</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #121212;
      color: #ffffff;
      text-align: center;
      padding: 50px;
    }
    .container {
      max-width: 400px;
      margin: auto;
      background-color: #1e1e1e;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    h1 { color: #00ffff; }
    img {
      border: 10px solid #ffffff;
      border-radius: 8px;
      margin: 20px 0;
    }
    p { color: #aaaaaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐉 Ryoto Wi-Fi Sharing</h1>
    <p>Scan this QR code with your phone's camera to connect instantly to:</p>
    <h2>${ssid}</h2>
    <img src="https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=WIFI:S:${encodeURIComponent(ssid)};T:${authType};P:${encodeURIComponent(cleanPassword)};;" alt="Wi-Fi QR Code">
    <p>Security: ${isNopass ? 'None' : 'WPA/WPA2'}</p>
  </div>
</body>
</html>
`;
        try {
          fs.writeFileSync(qrPath, htmlContent, 'utf8');
          console.log(`${context.esc.green}✔ Wi-Fi QR Code HTML saved to: ${qrPath}${context.esc.reset}`);
          
          // Auto-reveal in explorer
          const { revealInExplorer } = require('../lib/helpers');
          revealInExplorer(qrPath);

          // Open in default browser
          const { spawn } = require('child_process');
          spawn('cmd.exe', ['/c', 'start', '', qrPath], { detached: true, stdio: 'ignore' }).unref();
          console.log(`${context.esc.cyan}Opening QR Code in browser...${context.esc.reset}\n`);
        } catch (err) {
          console.error(`${context.esc.red}Failed to save QR Code file: ${err.message}${context.esc.reset}\n`);
        }
      } else {
        console.log(`${context.esc.red}Invalid selection.${context.esc.reset}\n`);
      }
    }
  }
};
