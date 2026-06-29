#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig } = require('./config');
const stats = require('./lib/stats');
const pkg = require('./package.json');
const { killAllProcesses } = require('./lib/shell');

// ANSI escape codes for formatting and rich color palettes
const esc = {
  clear: "\x1b[2J\x1b[3J\x1b[H",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  
  // Foreground Colors
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  
  // High Intensity
  hiCyan: "\x1b[96m",
  hiGreen: "\x1b[92m",
  hiYellow: "\x1b[93m",
  
  // Background Colors
  bgCyan: "\x1b[46m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
  bgWhite: "\x1b[47m",
  
  fgBlack: "\x1b[30m",
  fgWhite: "\x1b[97m",
};

// ---------------- STATE MACHINE DEFINITIONS ----------------
const State = {
  MENU: 'MENU',
  COMMAND_INPUT: 'COMMAND_INPUT',
  SUBPROCESS_RUNNING: 'SUBPROCESS_RUNNING'
};
let currentState = State.MENU;

function transitionTo(state) {
  currentState = state;
  if (state === State.MENU) {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
  } else {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }
}

// ---------------- DYNAMIC COMMANDS REGISTRY ----------------
const commands = {};
const menuOptions = [];

function registerCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  try {
    if (fs.existsSync(commandsDir)) {
      const files = fs.readdirSync(commandsDir);
      files.forEach(file => {
        if (file.endsWith('.js')) {
          try {
            const cmd = require(path.join(commandsDir, file));
            commands[cmd.name] = cmd;
            menuOptions.push({
              name: cmd.menuName,
              desc: cmd.desc,
              cmd: cmd.name
            });
          } catch (err) {
            console.error(`\x1b[31m[ERROR] Failed to load command file "${file}": ${err.message}\x1b[0m`);
          }
        }
      });
    }
  } catch (e) {
    console.error("Failed to read commands directory: " + e.message);
  }

  // Add exit option to menu dynamically
  menuOptions.push({
    name: "🚪  Exit Utility          ",
    desc: "Close the Ryoto CLI utility",
    cmd: "/exit"
  });
}

registerCommands();

let selectedIndex = 0;
let isTerminalMode = false;
let activeSpinner = null;

// Display a premium loading spinner
function startSpinner(message) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stdout.write(esc.hideCursor);
  activeSpinner = setInterval(() => {
    process.stdout.write(`\r${esc.cyan}${frames[i]}${esc.reset} ${message}...`);
    i = (i + 1) % frames.length;
  }, 80);
}

function stopSpinner(successMessage, isError = false) {
  if (activeSpinner) {
    clearInterval(activeSpinner);
    activeSpinner = null;
  }
  process.stdout.write("\r\x1b[K"); // Clear line
  if (isError) {
    console.log(`${esc.red}✖  ${successMessage}${esc.reset}`);
  } else {
    console.log(`${esc.green}✔  ${successMessage}${esc.reset}`);
  }
  process.stdout.write(esc.showCursor);
}

// Unified task runner context wrapper to prevent leaked spinners
async function runTask(label, taskFn) {
  startSpinner(label);
  try {
    const result = await taskFn();
    stopSpinner("Task completed successfully.");
    return result;
  } catch (err) {
    stopSpinner("Task encountered an error.", true);
    console.error(`${esc.red}Error: ${err.message}${esc.reset}`);
    throw err;
  }
}

let activeChildProcess = null;

// Run PowerShell while pausing the raw keypress stream so child stdin works
function runPowerShell(psCommand, opts = {}) {
  return new Promise((resolve) => {
    transitionTo(State.SUBPROCESS_RUNNING);
    const spawnOpts = { stdio: 'inherit' };
    if (opts.cwd) spawnOpts.cwd = opts.cwd;
    const child = spawn('powershell', ['-NoProfile', '-Command', psCommand], spawnOpts);
    activeChildProcess = child;
    child.on('close', (code) => {
      activeChildProcess = null;
      resolve(code);
    });
  });
}

// Capture user string input safely in CLI mode
function askQuestion(query) {
  return new Promise((resolve) => {
    transitionTo(State.COMMAND_INPUT);
    const rlInput = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rlInput.question(query, (ans) => {
      rlInput.close();
      resolve(ans.trim());
    });
  });
}

// Wait for a single keypress without triggering menu controls
function waitForKeypress() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    process.stdin.once('keypress', () => {
      resolve();
    });
  });
}

function printExitSummary() {
  console.log(`\n${esc.cyan}┌── SESSION PERFORMANCE SUMMARY ──────────────────────────────────────┐${esc.reset}`);
  console.log(`  Disk Space Cleaned  : ${esc.bold}${stats.freedMB.toFixed(2)} MB${esc.reset}`);
  console.log(`  Duplicates Removed  : ${esc.bold}${stats.duplicatesDeleted}${esc.reset} files`);
  console.log(`  Backups Vaulted     : ${esc.bold}${stats.backupsCreated}${esc.reset} sessions`);
  console.log(`  Scans Executed      : ${esc.bold}${stats.scansRun}${esc.reset} runs`);
  console.log(`${esc.cyan}└─────────────────────────────────────────────────────────────────────┘${esc.reset}`);
  console.log(`\n${esc.hiCyan}Thank you for using Ryoto. Keep coding!${esc.reset}\n`);
}

function printAsciiArt() {
  console.log(`${esc.cyan}${esc.bold}┌──────────────────────────────────────────────────────────────────────┐${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}│   ██████╗ ██╗   ██╗ ██████╗ ████████╗ ██████╗                        │${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}│   ██╔══██╗╚██╗ ██╔╝██╔═══██╗╚══██╔══╝██╔═══██╗                       │${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}│   ██████╔╝ ╚████╔╝ ██║   ██║   ██║   ██║   ██║                       │${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}│   ██╔══██╗  ╚██╔╝  ██║   ██║   ██║   ██║   ██║                       │${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}│   ██║  ██║   ██║   ╚██████╔╝   ██║   ╚██████╔╝                       │${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}│   ╚═╝  ╚═╝   ╚═╝    ╚═════╝    ╚═╝    ╚═════╝                        │${esc.reset}`);
  console.log(`${esc.cyan}${esc.bold}└──────────────────────────────────────────────────────────────────────┘${esc.reset}`);
  console.log(`  ${esc.bold}Ryoto System Optimizer & Diagnostic Shell v${pkg.version}${esc.reset}`);
}

function drawMenu() {
  process.stdout.write(esc.clear);
  printAsciiArt();
  console.log(`  ${esc.dim}Use [↑/↓] Arrow keys to navigate, [Enter] to select, or [/] for Terminal Mode.${esc.reset}\n`);

  for (let i = 0; i < menuOptions.length; i++) {
    const opt = menuOptions[i];
    if (i === selectedIndex) {
      console.log(`  ${esc.cyan}❯ ${esc.bold}${esc.bgWhite}${esc.fgBlack} ${opt.name} ${esc.reset}`);
    } else {
      console.log(`    ${esc.dim}${opt.name}${esc.reset}`);
    }
  }

  console.log(`\n${esc.cyan}┌─ Description ────────────────────────────────────────────────────────┐${esc.reset}`);
  const description = menuOptions[selectedIndex].desc;
  console.log(`  ${esc.italic}${description.padEnd(68)}${esc.reset}`);
  console.log(`${esc.cyan}└──────────────────────────────────────────────────────────────────────┘${esc.reset}`);
}

async function executeAction(cmd) {
  if (cmd === '/exit') {
    printExitSummary();
    process.exit(0);
  }

  let commandArgs = [];
  if (commands[cmd]) {
    const commandsWithFlags = ['/clean', '/doctor', '/export'];
    if (commandsWithFlags.includes(cmd)) {
      const input = await askQuestion(`Enter any optional flags (e.g. --dry-run, --fix, --json, --restore) [Press Enter for none]: `);
      if (input.trim().length > 0) {
        commandArgs = input.trim().split(' ').filter(a => a.length > 0);
      }
    }

    transitionTo(State.SUBPROCESS_RUNNING);
    process.stdout.write(esc.clear);
    printAsciiArt();

    const context = {
      esc,
      runPowerShell,
      askQuestion,
      startSpinner,
      stopSpinner,
      runTask,
      isTerminalMode
    };
    try {
      await commands[cmd].run(context, commandArgs);
    } catch (e) {
      console.error(`${esc.red}Error executing command ${cmd}: ${e.message}${esc.reset}`);
    }
  } else {
    transitionTo(State.SUBPROCESS_RUNNING);
    process.stdout.write(esc.clear);
    printAsciiArt();
    console.log(`\n${esc.red}Unknown command: ${cmd}${esc.reset}\n`);
  }

  // Wait for keypress to return to menu (in interactive mode)
  if (!isTerminalMode) {
    console.log(`${esc.dim}Press any key to return to menu...${esc.reset}`);
    await waitForKeypress();
    initInteractiveMenu();
  }
}

// ---------------- TERMINAL SHELL MODE (SLASH COMMANDS) ----------------
function startTerminalMode() {
  process.stdout.write(esc.clear);
  printAsciiArt();
  console.log(`  ${esc.bold}${esc.yellow}Interactive Slash-Command Mode Enabled.${esc.reset}`);
  console.log(`  ${esc.dim}Type /help for commands, /menu to go back, or /exit to quit.${esc.reset}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
      const list = Object.keys(commands).concat(["/menu", "/exit", "/help"]);
      const hits = list.filter((c) => c.startsWith(line.trim().toLowerCase()));
      return [hits.length ? hits : list, line];
    },
    prompt: `${esc.bold}${esc.hiGreen}ryuu > ${esc.reset}`
  });

  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    const trimmed = line.trim().toLowerCase();

    if (trimmed === '/menu') {
      rl.close();
      isTerminalMode = false;
      initInteractiveMenu();
      return;
    }

    if (trimmed === '/help') {
      console.log(`\n${esc.bold}Available Commands:${esc.reset}`);
      Object.keys(commands).forEach(k => {
        console.log(`  ${esc.cyan}${k.padEnd(12)}${esc.reset} - ${commands[k].desc}`);
      });
      console.log(`  ${esc.cyan}/menu       ${esc.reset} - Back to interactive arrow menu`);
      console.log(`  ${esc.cyan}/exit       ${esc.reset} - Exit program\n`);
    } else {
      const parts = line.trim().split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      
      if (cmd === '/exit') {
        rl.close();
        printExitSummary();
        process.exit(0);
      }
      
      if (commands[cmd]) {
        transitionTo(State.SUBPROCESS_RUNNING);
        const context = {
          esc,
          runPowerShell,
          askQuestion,
          startSpinner,
          stopSpinner,
          runTask,
          isTerminalMode: true
        };
        try {
          await commands[cmd].run(context, args);
        } catch (e) {
          console.error(`${esc.red}Error executing command: ${e.message}${esc.reset}`);
        }
      } else if (trimmed.length > 0) {
        console.log(`\n${esc.red}Unknown command: ${cmd}. Type /help for available commands.${esc.reset}\n`);
      }
    }

    if (isTerminalMode) {
      rl.resume();
      rl.prompt();
    }
  }).on('close', () => {
    if (isTerminalMode) {
      printExitSummary();
      process.exit(0);
    }
  });
}

// ---------------- INTERACTIVE ARROW-KEY NAVIGATION MENU ----------------
function initInteractiveMenu() {
  selectedIndex = 0;
  isTerminalMode = false;
  drawMenu();
  transitionTo(State.MENU);

  readline.emitKeypressEvents(process.stdin);

  // Clear previous listeners to avoid duplicates
  process.stdin.removeAllListeners('keypress');

  process.stdin.on('keypress', async (str, key) => {
    if (currentState !== State.MENU) return;

    if (key && key.ctrl && key.name === 'c') {
      killAllProcesses();
      process.stdout.write(esc.showCursor);
      process.exit(0);
    }

    if (key) {
      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + menuOptions.length) % menuOptions.length;
        drawMenu();
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % menuOptions.length;
        drawMenu();
      } else if (key.name === 'return') {
        const selected = menuOptions[selectedIndex];
        await executeAction(selected.cmd);
      }
    }
    
    if (str === '/') {
      isTerminalMode = true;
      startTerminalMode();
    }
  });
}

// ---------------- ARGUMENT CONTROLLER ----------------
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`\n${esc.bold}Ryoto CLI Usage Guidelines:${esc.reset}`);
  console.log(`  ryoto                - Launch interactive keyboard arrow selection menu`);
  console.log(`  ryoto --version, -v  - View current utility version`);
  console.log(`  ryoto --help, -h     - View command line help guidelines\n`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`ryoto version ${pkg.version}`);
  process.exit(0);
}

// Global safety restore handlers for unexpected errors to prevent stuck raw-mode terminal states
process.on('uncaughtException', (err) => {
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch (e) {}
  }
  process.stdout.write(esc.showCursor);
  console.error(`\n\x1b[31m[CRITICAL UNCAUGHT ERROR] ${err.stack || err.message || err}\x1b[0m\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch (e) {}
  }
  process.stdout.write(esc.showCursor);
  console.error(`\n\x1b[31m[CRITICAL UNHANDLED REJECTION] ${reason}\x1b[0m\n`);
  process.exit(1);
});

process.on('SIGINT', () => {
  if (activeChildProcess) {
    try { activeChildProcess.kill('SIGTERM'); } catch (e) {}
  }
  killAllProcesses();
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch (e) {}
  }
  process.stdout.write(esc.showCursor);
  console.log(`\n\x1b[36m[SIGINT] Process terminated by user. Exiting.\x1b[0m\n`);
  process.exit(130);
});

// Start application
initInteractiveMenu();
