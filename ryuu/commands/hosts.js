const os = require('os');
const fs = require('fs');
const path = require('path');
const { runPowerShellCapture } = require('../lib/shell');
const { checkPlatform } = require('../lib/helpers');

const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const BACKUP_DIR = path.join(os.homedir(), '.ryuu', 'backups');

const TELEMETRY_DOMAINS = [
  'vortex.data.microsoft.com',
  'settings-win.data.microsoft.com',
  'telemetry.microsoft.com',
  'watson.telemetry.microsoft.com',
  'diagnostics.support.microsoft.com',
  'corp.sts.microsoft.com',
  'statsfe2.ws.microsoft.com',
  'survey.watson.microsoft.com',
  'oca.telemetry.microsoft.com',
  'sqm.telemetry.microsoft.com'
];

async function checkAdmin() {
  const check = await runPowerShellCapture('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)');
  return check.stdout.trim() === 'True';
}

function backupHosts() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `hosts.bak`);
    fs.copyFileSync(HOSTS_PATH, backupPath);
  } catch (e) {}
}

module.exports = {
  name: '/hosts',
  menuName: '🛡️  Hosts File Manager      ',
  desc: 'View, add, or remove local domain mappings, and block Windows telemetry trackers',
  run: async (context) => {
    if (!checkPlatform(context)) return;

    console.log(`\n${context.esc.yellow}${context.esc.bold}[HOSTS MANAGER] Checking permissions...${context.esc.reset}`);
    const isAdmin = await checkAdmin();
    if (!isAdmin) {
      console.log(`${context.esc.red}Error: Modifying the hosts file requires Administrator privileges.${context.esc.reset}`);
      console.log(`${context.esc.yellow}Please relaunch Ryoto in a terminal run as Administrator.${context.esc.reset}\n`);
      return;
    }

    if (!fs.existsSync(HOSTS_PATH)) {
      console.log(`${context.esc.red}Error: Hosts file not found at "${HOSTS_PATH}".${context.esc.reset}\n`);
      return;
    }

    // Always backup before doing anything
    backupHosts();

    let inHostsMenu = true;
    while (inHostsMenu) {
      console.log(`\n${context.esc.cyan}${context.esc.bold}Hosts File Settings:${context.esc.reset}`);
      console.log(`  1. View active mappings`);
      console.log(`  2. Add custom domain mapping`);
      console.log(`  3. Remove domain mapping`);
      console.log(`  4. Block Windows Telemetry trackers`);
      console.log(`  5. Exit Hosts Manager`);

      const choice = await context.askQuestion(`\nSelect an option (1-5): `);
      console.log();

      let hostsContent = fs.readFileSync(HOSTS_PATH, 'utf8');

      switch (choice) {
        case '1':
          console.log(`${context.esc.cyan}┌── ACTIVE HOSTS MAPPINGS ───────────────────────────────────────────┐${context.esc.reset}`);
          const lines = hostsContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
          
          if (lines.length === 0) {
            console.log(`  No custom active mappings found.`);
          } else {
            lines.forEach(l => console.log(`  ${l}`));
          }
          console.log(`${context.esc.cyan}└────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);
          break;

        case '2':
          const ip = await context.askQuestion(`Enter IP Address [default: 127.0.0.1]: `);
          const activeIp = ip.trim() || '127.0.0.1';
          const hostName = await context.askQuestion(`Enter Hostname (e.g. test.local): `);
          const activeHost = hostName.trim().toLowerCase();

          if (!activeHost) {
            console.log(`${context.esc.red}Hostname cannot be empty.${context.esc.reset}\n`);
            break;
          }

          // Check if already exists
          if (hostsContent.toLowerCase().includes(` ${activeHost}`) || hostsContent.toLowerCase().includes(`\t${activeHost}`)) {
            console.log(`${context.esc.red}Error: Mapping for "${activeHost}" already exists.${context.esc.reset}\n`);
            break;
          }

          try {
            fs.appendFileSync(HOSTS_PATH, `\n${activeIp} ${activeHost}`);
            console.log(`${context.esc.green}✔ Successfully added: ${activeIp} ${activeHost}${context.esc.reset}\n`);
          } catch (err) {
            console.error(`${context.esc.red}Failed to write to hosts file: ${err.message}${context.esc.reset}\n`);
          }
          break;

        case '3':
          const removeHost = await context.askQuestion(`Enter Hostname to remove: `);
          const targetHost = removeHost.trim().toLowerCase();

          if (!targetHost) {
            console.log(`${context.esc.red}Hostname cannot be empty.${context.esc.reset}\n`);
            break;
          }

          const fileLines = hostsContent.split('\n');
          const filteredLines = fileLines.filter(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) return true;
            const parts = trimmed.split(/\s+/);
            return parts.length < 2 || parts[1].toLowerCase() !== targetHost;
          });

          if (fileLines.length === filteredLines.length) {
            console.log(`${context.esc.yellow}No matching mapping found for "${targetHost}".${context.esc.reset}\n`);
          } else {
            try {
              fs.writeFileSync(HOSTS_PATH, filteredLines.join('\n'), 'utf8');
              console.log(`${context.esc.green}✔ Successfully removed mapping for "${targetHost}".${context.esc.reset}\n`);
            } catch (err) {
              console.error(`${context.esc.red}Failed to write to hosts file: ${err.message}${context.esc.reset}\n`);
            }
          }
          break;

        case '4':
          console.log(`Checking telemetry domains block status...`);
          const toAdd = [];
          TELEMETRY_DOMAINS.forEach(domain => {
            if (!hostsContent.toLowerCase().includes(` ${domain}`) && !hostsContent.toLowerCase().includes(`\t${domain}`)) {
              toAdd.push(domain);
            }
          });

          if (toAdd.length === 0) {
            console.log(`${context.esc.green}✔ All telemetry tracker domains are already blocked!${context.esc.reset}\n`);
          } else {
            console.log(`Found ${toAdd.length} unblocked telemetry domains.`);
            const confirm = await context.askQuestion(`Do you want to block these telemetry trackers? (y/n): `);
            if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
              try {
                let appendText = '\n# Ryoto Windows Telemetry Blocks\n';
                toAdd.forEach(domain => {
                  appendText += `0.0.0.0 ${domain}\n`;
                });
                fs.appendFileSync(HOSTS_PATH, appendText);
                console.log(`${context.esc.green}✔ Successfully blocked ${toAdd.length} telemetry domains!${context.esc.reset}\n`);
              } catch (err) {
                console.error(`${context.esc.red}Failed to write to hosts file: ${err.message}${context.esc.reset}\n`);
              }
            }
          }
          break;

        case '5':
        default:
          inHostsMenu = false;
          break;
      }
    }
  }
};
