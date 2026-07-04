const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/doctor',
  menuName: '🩺  Developer Doctor      ',
  desc: 'Verify installation & versions of Git, Node, Python, Docker, etc.',
  run: async (context, args = []) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Developer Doctor diagnostics are currently only optimized for Windows PATH configs.${context.esc.reset}\n`);
      return;
    }

    const autoFix = args.includes('--fix') || args.includes('-f');

    console.log(`\n${context.esc.yellow}${context.esc.bold}[DOCTOR] Diagnostic scan of developer tools...${context.esc.reset}\n`);
    
    const result = await context.runTask("Auditing developer toolchains", async () => {
      const doctorScript = `
        function Check-Tool($cmd, $displayName, $winGetId) {
            $exe = Get-Command $cmd -ErrorAction SilentlyContinue
            $status = if ($exe) { "OK" } else { "MISSING" }
            $ver = ""
            if ($exe) {
                try {
                    if ($cmd -eq "node") { $ver = & node -v }
                    elseif ($cmd -eq "npm") { $ver = & npm.cmd -v }
                    elseif ($cmd -eq "git") { $ver = & git --version }
                    elseif ($cmd -eq "python") { $ver = & python --version }
                    elseif ($cmd -eq "pip") { $ver = & pip --version }
                    elseif ($cmd -eq "conda") { $ver = "Installed" }
                    elseif ($cmd -eq "docker") { $ver = & docker --version }
                    elseif ($cmd -eq "code") { $ver = "Installed" }
                } catch {
                    $ver = "Installed"
                }
            }
            [PSCustomObject]@{
                Command = $cmd
                Name = $displayName
                Status = $status
                Version = if ($ver -ne $null) { $ver.ToString().Trim() } else { "" }
                WinGetId = $winGetId
            }
        }
        $tools = @()
        $tools += Check-Tool "git" "Git SCM" "Git.Git"
        $tools += Check-Tool "node" "Node.js runtime" "OpenJS.NodeJS"
        $tools += Check-Tool "npm" "NPM Package Manager" "OpenJS.NodeJS"
        $tools += Check-Tool "python" "Python" "Python.Python.3.13"
        $tools += Check-Tool "pip" "Pip Installer" "Python.Python.3.13"
        $tools += Check-Tool "conda" "Conda/Anaconda" "Anaconda.Anaconda3"
        $tools += Check-Tool "docker" "Docker" "Docker.DockerDesktop"
        $tools += Check-Tool "code" "VS Code" "Microsoft.VisualStudioCode"
        $tools | ConvertTo-Json
      `;
      const res = await runPowerShellCapture(doctorScript);
      return res.stdout;
    });

    let tools = [];
    try {
      if (result) {
        tools = JSON.parse(result);
      }
    } catch (e) {}

    if (tools.length === 0) {
      console.log(`${context.esc.red}Error: Failed to fetch tool status.${context.esc.reset}\n`);
      return;
    }

    const missingTools = [];

    console.log(`${context.esc.cyan}Checking primary developer toolchains:${context.esc.reset}`);
    tools.forEach(t => {
      if (t.Status === 'OK') {
        console.log(`  ${context.esc.green}[OK]${context.esc.reset} ${t.Name.padEnd(22)}: Found (${t.Version})`);
      } else {
        console.log(`  ${context.esc.red}[MISSING]${context.esc.reset} ${t.Name.padEnd(18)}: Not found on PATH!`);
        missingTools.push(t);
      }
    });
    console.log();

    if (missingTools.length === 0) {
      console.log(`${context.esc.green}✔ All toolchains are fully installed and configured!${context.esc.reset}\n`);
      return;
    }

    let fixChoice = 'n';
    if (autoFix) {
      fixChoice = 'y';
    } else {
      fixChoice = await context.askQuestion(`Would you like to install the missing tools using winget? (y/n): `);
    }

    if (fixChoice.toLowerCase() === 'y' || fixChoice.toLowerCase() === 'yes') {
      for (const t of missingTools) {
        const installChoice = await context.askQuestion(`Install ${t.Name} (${t.WinGetId}) now? (y/n): `);
        if (installChoice.toLowerCase() === 'y' || installChoice.toLowerCase() === 'yes') {
          console.log(`\nInstalling ${t.Name} via winget...`);
          console.log(`${context.esc.yellow}💡 Tip: Windows will request Administrator permissions. Please approve the flashing UAC prompt on your screen, or run this terminal as Administrator to bypass it.${context.esc.reset}\n`);
          // We run winget as a sub-process so the output is shown directly
          await context.runPowerShell(`winget install ${t.WinGetId} --accept-package-agreements --accept-source-agreements`);
          console.log(`${context.esc.green}✔ Install task for ${t.Name} complete.${context.esc.reset}\n`);
        }
      }
      console.log(`All selected tool installs completed. Restart your terminal window to reload system PATH variables!\n`);
    } else {
      console.log(`${context.esc.cyan}Doctor diagnostic finished. Run "/doctor --fix" to repair PATHs later.${context.esc.reset}\n`);
    }
  }
};
