# Ryoto CLI Release & Installation Report 🐉

Welcome to **Ryoto** (formerly Ryuu), your personal interactive System Optimizer, Diagnostics, and Maintenance shell built in Node.js and PowerShell. 

This report outlines the finalized architecture, directory specifications, global installation guides, and local development setup instructions.

---

## 🚀 Installation & Usage Guide

### 1. Global Installation (For other computers & users)
Ryoto is published publicly on the NPM registry! Anyone in the world can install it globally on their system:

```powershell
npm install -g @rahulrc48/ryoto
```

Once installed, they can launch the optimizer shell from **any folder or command prompt** simply by typing:
```powershell
ryoto
```

---

### 2. Local Developer Link (For your PC)
If you want to run and test changes to your local code folder (`C:\Users\Rahul\OneDrive\Desktop\rahulrc\ryuu`) without installing it from the web, you use a local symbolic link:

1. Open your terminal in your project directory:
   ```powershell
   cd "C:\Users\Rahul\OneDrive\Desktop\rahulrc\ryuu"
   ```
2. Link the folder locally:
   ```powershell
   npm link
   ```
   *(If you hit a PowerShell script block warning, bypass it by running: `cmd.exe /c "npm.cmd link"`)*

Now, when you type **`ryoto`** in **any directory or terminal window** on your PC, Windows will immediately launch the local code from your project directory. Any code changes you make inside your editor will be active instantly!

---

## 🛠️ Complete Feature Index

Ryoto loads all optimizer sub-commands dynamically from the `commands/` registry. Here is a breakdown of what you can run inside the shell:

| Command | Menu Title | Description |
| :--- | :--- | :--- |
| **`/advisor`** | 🤖 System Health Advisor | Severity-sorted warnings covering battery degradation, low disk space (<15%), holding vault bloat (>500MB), MySQL idle instances, and temp cache trends. |
| **`/benchmark`** | ⚡ Hardware Benchmark | Timed CPU math loop (10,000,000 runs) + sequential Disk IO speed check (25MB write/read buffer). Calculates a custom performance score and system tier. |
| **`/clean`** | ⚡ System Quick Clean | Safe cache purges (NPM, Conda, Pip, HuggingFace) with interactive prompts. Moves `node_modules` to the local holding vault. Includes a `--dry-run` simulation mode. |
| **`/disk`** | 💾 Disk Space Analyzer | Scans directories recursively using Node streams to output size-ranked maps of large directories. |
| **`/doctor`** | 🩺 Developer Doctor | Audits Git, Node, NPM, Python, Conda, Docker, and VS Code. In `--fix` mode, offers to install missing toolchains using Windows `winget`. |
| **`/duplicates`** | 🔍 Duplicate Finder | Searches folders recursively for identical files using fast stream-based MD5 hashing. Safely excludes `.git`, `node_modules`, system files, and project lockfiles from deletion lists. |
| **`/env`** | 🌳 PATH Env Auditor | Identifies duplicate entries and dead directories in your user `%PATH%`. Backs up the original PATH before rewriting the registry. |
| **`/export`** | 💾 Export Diagnostic Report | Generates detailed system summaries in Markdown and dark-themed HTML report files. Supports `--json` for machine-readable output. |
| **`/git`** | 📂 Git Manager | Git status parser counting staged/unstaged changes, secure commit message file-writing (preventing escaping breaks), log inspector, and repository puller. |
| **`/processes`** | 🌳 Memory Process Tree | Visualizes process trees and memory footprints of the top 8 heaviest processes running on Windows. |
| **`/scan`** | 🛡️ Malware Quick Scan | Triggers a background Defender quick scan without blocking the terminal. |
| **`/snapshot`** | 💾 System State Snapshot | Captures snapshots of installed packages, startup configs, and PATH, letting you diff system changes across sessions. |
| **`/startup`** | 🔌 Startup Manager | Lists active startup programs and registry run locations, backs them up to the vault, and allows you to disable/restore chosen apps. |
| **`/uninstall`** | 🗑️ Package Uninstaller | Lists installed programs sorted by registry size estimations and prompts for silent, injection-safe native uninstallations. |
| **`/wifi`** | 📶 Wi-Fi Tool | Displays saved Wi-Fi profiles masked by default (`••••••••`), prompting for decrypted plaintext keys only on request. |

---

## 🔒 Security & Data Integrity Architecture

* **Zero-Privilege Battery Metrics (`lib/battery.js`):** Bypasses WMI Administrator privileges by generating local `powercfg /batteryreport` files and using Node regex to parse `DESIGN CAPACITY` and `FULL CHARGE CAPACITY`.
* **Central Shell Runner (`lib/shell.js`):** Spawns child PowerShell processes with a default 30-second execution timeout. If a process freezes, it is terminated immediately. Stderr streams are routed to `~/.ryoto/logs/last-error.log` to keep your workspace clean.
* **Registry Backup Protection (`lib/vault.js`):** Overwriting user PATH variables generates a raw text backup inside `~/.ryoto/holding/env-<timestamp>/path-backup.txt` first. The restore manager validates `res.status` before deleting the backup to prevent false-positive completions.
* **Injection-Safe Package Uninstaller (`commands/uninstall.js`):** Bypasses shell wrapping exploits by writing registry-provided uninstall strings to local file buffers, parsing parameters, and executing uninstallation binaries directly via PowerShell `Start-Process` (avoiding shell command-chaining injections).
* **Vault Folder Renaming:** Directory moves are attempted as a single unit using `fs.renameSync` first. This reduces backup times from minutes to milliseconds and stores folder units cleanly in `map.json`.
