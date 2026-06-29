const os = require('os');

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

module.exports = {
  checkPlatform,
  confirmAction,
  drawProgressBar
};
