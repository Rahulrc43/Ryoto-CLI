# Ryoto CLI 🐉

Ryoto is a lightweight, zero-dependency, interactive command-line interface (CLI) tool designed for Windows developers to optimize startup items, uninstall bloated packages, audit environment variables, clean caches, run hardware benchmarks, compare system state snapshots, and diagnose laptop health.

Built with Node.js and native PowerShell hooks, Ryoto starts instantly, uses zero external NPM dependencies, and works out-of-the-box.

---

## 🔒 Security Hardened in v1.1.4

Ryoto is designed from the ground up with a focus on safety and transparency. Version **1.1.4** includes critical security hardening enhancements:
* **🛡️ Strict Path & Registry Restorations:** All vault restores (`/clean --restore`) validate restore target paths. Registry key restorations are allowlisted strictly to standard startup locations, preventing any possibility of malicious persistence or directory traversal attacks.
* **🧼 Log Data Redaction:** System error logs (`~/.ryoto/logs/last-error.log`) automatically mask and sanitize command arguments. Sensitive information like Wi-Fi SSID profiles and passwords are redacted at the source.
* **⚠️ Argument Injection Immunity:** By utilizing temp file serialization instead of raw string concatenation, Ryoto prevents shell command-chaining or variable interpolation exploits in Windows PowerShell.

---

## 🚀 Key Features

* **🔌 Startup Manager (`/startup`):** Enumerate active boot commands, analyze resource impact, and disable selected startup registry keys interactively.
* **🗑️ Package Uninstaller (`/uninstall`):** Scan installed native packages, sort them by estimated size, and launch silent, injection-safe uninstallations.
* **🌳 PATH Env Auditor (`/env`):** Inspect user environment variables, prune duplicate folders or dead folder links, and write back safely (original PATH is backed up).
* **⚡ Hardware Benchmark (`/benchmark`):** Run synthetic CPU loops and Disk write/read checks to measure raw hardware speed and rank performance tier.
* **💾 System State Snapshot (`/snapshot`):** Capture snapshots of your active software config, startup directories, and PATH, letting you diff changes across sessions.
* **🤖 System Health Advisor (`/advisor`):** Diagnose CPU, RAM, database servers, and battery wear health (design capacity vs. full capacity) without needing Administrator elevation.
* **⚡ System Quick Clean (`/clean`):** Purge temp caches (NPM, Conda, Pip, HuggingFace, system cache) and vault `node_modules` folders. Supports dry-runs.
* **🔍 Duplicate Finder (`/duplicates`):** MD5-hashing file scanner. Safely protects `.git`, `node_modules`, system paths, and config lockfiles from deletion.
* **💾 Export Diagnostic Report (`/export`):** Save system telemetry summaries in Markdown and custom dark-themed HTML report files. Supports `--json` mode.
* **🩺 Developer Doctor (`/doctor`):** Audit Git, Node, Python, Conda, Docker, and VS Code. Supports auto-repairing missing tools using `winget`.
* **📂 Git Manager (`/git`):** Fast commit dispatcher staging files, writing commit messages via temp files to avoid escape breaks, and parsing porcelain status.
* **🔌 Open Ports Scan (`/ports`):** Scans listening ports and maps the processes and PIDs owning them.
* **🌳 Memory Process Tree (`/processes`):** Visualizes active process hierarchies and RAM footprint footprints.
* **📶 Wi-Fi Tool (`/wifi`):** Lists saved Wi-Fi networks with passwords masked by default (`••••••••`) for secure screen sharing.

---

## 📦 Installation & Setup

### Prerequisites
* Windows 10 or 11
* Node.js (version 16 or higher)

### Method 1: Global Install from NPM (Recommended)
You can install the official published package directly from any Command Prompt or PowerShell window:
```bash
npm install -g @rahulrc48/ryoto
```

### Method 2: Local Developer Setup
1. Clone the repository and navigate into the folder:
   ```bash
   cd path/to/ryoto
   ```
2. Link the folder locally so typing the command runs your local directory code:
   ```bash
   npm link
   ```
   *(If script execution is disabled, run: `cmd.exe /c "npm.cmd link"`)*

---

## 🎮 How to Use

Type **`ryoto`** in any Command Prompt, PowerShell, or Git Bash terminal:
```bash
ryoto
```

### Controls:
* **Interactive Menu (Default):** Use **`Up / Down` arrow keys** to navigate the options, and press **`Enter`** to execute a command.
* **Terminal Command Mode:** Press the **`/` key** on your keyboard (or select *Terminal Mode*) to open a classic command prompt shell.
  * Autocomplete: Type `/` and press **`Tab`** to show or autocomplete available commands.
  * Back to menu: Type **`/menu`** to return to the interactive list.
  * Exit: Type **`/exit`** to close the program.
