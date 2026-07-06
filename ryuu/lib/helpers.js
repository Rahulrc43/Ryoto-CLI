const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

let updateMessage = null;

/**
 * Checks if the current OS is Windows, otherwise logs a red error.
 * @param {object} context 
 * @returns {boolean}
 */
function checkPlatform(context) {
  if (os.platform() !== 'win32') {
    console.log(`\n${context.esc.red}Error: This diagnostic command is only supported on Windows.${context.esc.reset}\n`);
    return false;
  }
  return true;
}

/**
 * Prompts the user for a yes/no confirmation.
 * @param {object} context 
 * @param {string} question 
 * @returns {Promise<boolean>}
 */
async function confirmAction(context, question) {
  const ans = await context.askQuestion(question);
  const trimmed = ans.toLowerCase().trim();
  return trimmed === 'y' || trimmed === 'yes';
}

/**
 * Renders a visual progress bar in the terminal stdout.
 * @param {object} esc 
 * @param {number} processed 
 * @param {number} total 
 * @param {string} suffix 
 */
function drawProgressBar(esc, processed, total, suffix = '') {
  if (total <= 0) return;
  const pct = Math.floor((processed / total) * 100);
  const barWidth = 25;
  const filledWidth = Math.round((pct / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = "█".repeat(filledWidth) + "░".repeat(emptyWidth);
  process.stdout.write(`\r${esc.cyan}[${progressBar}] ${pct}% (${processed}/${total})${suffix ? ' - ' + suffix : ''}\x1b[K`);
}

/**
 * Parse CLI flags and options.
 * @param {string[]} args 
 * @returns {object}
 */
function parseArgs(args) {
  const flags = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      flags[key] = val !== undefined ? val : true;
    } else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true;
    }
  });
  return flags;
}

/**
 * Asynchronously checks npm registry for updates.
 * @param {string} currentVersion 
 */
function checkNpmUpdate(currentVersion) {
  const options = {
    hostname: 'registry.npmjs.org',
    path: '/@rahulrc48/ryoto/latest',
    method: 'GET',
    headers: { 'User-Agent': 'Ryoto-CLI-Updater' },
    timeout: 2000
  };
  const req = https.get(options, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const latest = JSON.parse(data).version;
        if (latest && latest !== currentVersion) {
          updateMessage = `\n\x1b[33m💡 Update Available: Ryoto v${latest} is out! Run "npm update -g @rahulrc48/ryoto" to update.\x1b[0m\n`;
        }
      } catch (e) {}
    });
  });
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
}

/**
 * Returns the cached update notice message.
 * @returns {string|null}
 */
function getUpdateMessage() {
  return updateMessage;
}

/**
 * Auto-reveals a file in Windows File Explorer.
 * @param {string} filePath 
 */
function revealInExplorer(filePath) {
  if (os.platform() !== 'win32') return;
  try {
    spawn('explorer.exe', [`/select,${filePath}`], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {}
}

module.exports = {
  checkPlatform,
  confirmAction,
  drawProgressBar,
  parseArgs,
  checkNpmUpdate,
  getUpdateMessage,
  revealInExplorer
};
