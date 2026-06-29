const os = require('os');

module.exports = {
  name: '/update',
  menuName: '🚀  Software Upgrades    ',
  desc: 'Check and install software upgrades globally using winget CLI',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: winget updates are only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[UPGRADES] Querying winget package manager...${context.esc.reset}\n`);
    await context.runPowerShell('winget upgrade');

    const confirmUpdate = await context.askQuestion(`\n${context.esc.bold}Do you want to upgrade all outdated software now? (y/n):${context.esc.reset} `);

    if (confirmUpdate.toLowerCase() === 'y' || confirmUpdate.toLowerCase() === 'yes') {
      console.log(`\n${context.esc.yellow}Updating all outdated apps...${context.esc.reset}\n`);
      await context.runPowerShell('winget upgrade --all --accept-package-agreements --accept-source-agreements');
    } else {
      console.log(`\n${context.esc.cyan}Upgrade cancelled.${context.esc.reset}\n`);
    }
  }
};
