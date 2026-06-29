const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.ryoto', 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'last-error.log');

const activeProcesses = new Set();

function sanitizeScriptForLog(script) {
  if (typeof script !== 'string') return '';
  let sanitized = script;
  // Mask netsh key clear or any potential password arguments
  sanitized = sanitized.replace(/key=clear/gi, 'key=REDACTED');
  // Mask Wi-Fi profile name assignments
  sanitized = sanitized.replace(/(name\s*=\s*")[^"]+(")/gi, '$1REDACTED$2');
  return sanitized;
}

function runPowerShellCapture(script, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000; // 30s default
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch (e) {}

    const spawnOpts = {};
    if (opts.cwd) spawnOpts.cwd = opts.cwd;

    const proc = spawn('powershell', ['-NoProfile', '-Command', script], spawnOpts);
    activeProcesses.add(proc);

    proc.on('error', (err) => {
      try {
        fs.writeFileSync(ERROR_LOG, `[${new Date().toISOString()}] Spawn Error: ${err.message}\nScript:\n${sanitizeScriptForLog(script)}\n`, 'utf8');
      } catch (e) {}
      activeProcesses.delete(proc);
      resolve({
        success: false,
        timedOut: false,
        code: null,
        stdout: "",
        stderr: err.message
      });
    });
    
    let stdout = "";
    let stderr = "";

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch (e) {}
      activeProcesses.delete(proc);
      resolve({
        success: false,
        timedOut: true,
        code: null,
        stdout: stdout.trim(),
        stderr: stderr.trim() + "\n[ERROR] Command timed out after " + timeoutMs + "ms"
      });
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      activeProcesses.delete(proc);
      
      if (stderr.trim().length > 0) {
        try {
          fs.writeFileSync(ERROR_LOG, `[${new Date().toISOString()}] Exit Code: ${code}\nScript:\n${sanitizeScriptForLog(script)}\nError:\n${stderr}\n`, 'utf8');
        } catch (e) {}
      }

      resolve({
        success: code === 0 && stderr.trim().length === 0,
        timedOut: false,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function killAllProcesses() {
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch (e) {}
  }
  activeProcesses.clear();
}

module.exports = { runPowerShellCapture, killAllProcesses };
