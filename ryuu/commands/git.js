const fs = require('fs');
const path = require('path');
const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/git',
  menuName: '📂  Git Manager           ',
  desc: 'Manage Git repository status, commits, pushes, and pulls',
  run: async (context) => {
    console.log(`\n${context.esc.yellow}${context.esc.bold}[GIT MANAGER] Entering Git control module...${context.esc.reset}\n`);
    let repoPath = await context.askQuestion(`Enter Git project folder path (Press Enter for current directory): `);
    if (!repoPath) repoPath = process.cwd();

    if (!fs.existsSync(repoPath)) {
      console.log(`${context.esc.red}Error: Path "${repoPath}" does not exist.${context.esc.reset}\n`);
      return;
    }

    // Check if git repo
    const hasGit = fs.existsSync(path.join(repoPath, '.git'));
    if (!hasGit) {
      const initChoice = await context.askQuestion(`${context.esc.yellow}This folder is not a Git repo. Initialize it? (y/n):${context.esc.reset} `);
      if (initChoice.toLowerCase() === 'y' || initChoice.toLowerCase() === 'yes') {
        console.log(`\nInitializing repository...`);
        await runPowerShellCapture('git init', { cwd: repoPath });
      } else {
        console.log(`${context.esc.cyan}Git initialization skipped.${context.esc.reset}\n`);
        return;
      }
    }

    // Git action menu loop
    let inGitMenu = true;
    while (inGitMenu) {
      console.log(`\n${context.esc.cyan}${context.esc.bold}Git Repository: ${repoPath}${context.esc.reset}`);
      console.log(`  1. Check Status (git status parser)`);
      console.log(`  2. Quick Commit & Push (Add all -> Commit -> Push)`);
      console.log(`  3. View Recent Commits (git log)`);
      console.log(`  4. Pull Remote Updates (git pull)`);
      console.log(`  5. Exit Git Manager`);
      
      const gitChoice = await context.askQuestion(`\nSelect an option (1-5): `);
      console.log();

      switch (gitChoice) {
        case '1':
          const statusRes = await runPowerShellCapture('git status --porcelain', { cwd: repoPath });
          if (statusRes.stdout.length === 0) {
            console.log(`\n${context.esc.green}✔ Working directory clean. Nothing to commit.${context.esc.reset}\n`);
          } else {
            const lines = statusRes.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            let staged = 0;
            let unstaged = 0;
            let untracked = 0;
            
            lines.forEach(l => {
              if (l.startsWith('??')) {
                untracked++;
              } else if (l.charAt(0) !== ' ' && l.charAt(0) !== '?') {
                staged++;
              } else {
                unstaged++;
              }
            });
            
            console.log(`${context.esc.cyan}┌── GIT STATUS SUMMARY ──────────────────────────────────────────────┐${context.esc.reset}`);
            console.log(`  Staged Changes      : ${context.esc.green}${staged} files${context.esc.reset}`);
            console.log(`  Unstaged Changes    : ${context.esc.yellow}${unstaged} files${context.esc.reset}`);
            console.log(`  Untracked Files     : ${context.esc.red}${untracked} files${context.esc.reset}`);
            console.log(`${context.esc.cyan}└────────────────────────────────────────────────────────────────────┘${context.esc.reset}`);
            
            const detail = await context.askQuestion(`\nDo you want to see the detailed git status? (y/n): `);
            if (detail.toLowerCase() === 'y' || detail.toLowerCase() === 'yes') {
              console.log();
              await context.runPowerShell('git status', { cwd: repoPath });
            }
          }
          break;
        case '2':
          const commitMsg = await context.askQuestion(`Enter commit message: `);
          if (!commitMsg) {
            console.log(`${context.esc.red}Commit message cannot be empty.${context.esc.reset}`);
            break;
          }
          const tempMsgPath = path.join(os.tmpdir(), 'git-commit-msg.txt');
          fs.writeFileSync(tempMsgPath, commitMsg, 'utf8');
          console.log(`Staging, committing, and pushing...`);
          await context.runPowerShell(`git add .; git commit -F "${tempMsgPath.replace(/\\/g, '\\\\')}"; git push; Remove-Item "${tempMsgPath.replace(/\\/g, '\\\\')}" -Force -ErrorAction SilentlyContinue`, { cwd: repoPath });
          break;
        case '3':
          await context.runPowerShell('git log -n 5 --oneline', { cwd: repoPath });
          break;
        case '4':
          await context.runPowerShell('git pull', { cwd: repoPath });
          break;
        case '5':
        default:
          inGitMenu = false;
          break;
      }
    }
    console.log();
  }
};
