# Ryuu CLI 🐉 | Comprehensive System & Utility Report

Ryuu is a premium, zero-dependency Node.js command-line utility built specifically for Windows 10/11 environments. It bridges interactive terminal inputs with native PowerShell scripting to deliver high-performance system cleaning, real-time diagnostics, developer tool auditing, Git automation, and advanced file management.

---

## 1. Executive Summary & Synopsis

During this session, we expanded the **`ryuu`** CLI from a simple text prompt into a fully interactive dual-mode dashboard. Over the course of testing and refining, we hit and successfully resolved several deep Windows shell and Node.js stream execution challenges. 

The utility has been globally linked to your system PATH via `npm link` and is fully optimized for speed, safety, and stability.

---

## 2. Interactive Menu Options (13 Commands)

Ryuu features a visual keyboard navigation interface (use `Up/Down` arrow keys and `Enter`) and a terminal command mode (triggered by typing `/` and pressing `Tab` for autocomplete).

| Option | Action | Under the Hood Implementation |
| :--- | :--- | :--- |
| **`⚡ System Quick Clean`** (`/clean`) | **Purge Temp & Caches** | Deletes user/system temp directories, NPM cache, Pip cache, Conda package cache, and Phone Link caches. |
| **`🚀 Software Upgrades`** (`/update`) | **Upgrade Software** | Scans for outdated programs via `winget` and prompts for bulk upgrades. |
| **`📊 Hardware Diagnostics`** (`/info`) | **Hardware Specifications** | Extracts CPU, RAM, GPU, SSD model, 144Hz display configurations, and battery design capacity metrics. |
| **`🌳 Memory Process Tree`** (`/processes`) | **RAM Process Tree** | Generates a visual hierarchy tree of active background tasks sorted by RAM footprint. |
| **`🛡️ Malware Quick Scan`** (`/scan`) | **Defender Security Check** | Spawns a background Windows Defender quick scan. |
| **`🩺 Developer Doctor`** (`/doctor`) | **Dev Environment Check** | Audits the installation and versions of Git, Node, NPM, Python, Pip, Conda, Docker, and VS Code. |
| **`📂 Git Manager`** (`/git`) | **Repository Controller** | Offers an interactive shell to check status, pull, log, and run a **Quick Commit & Push** (auto-stage, commit, and push). |
| **`🔍 Duplicate Finder`** (`/duplicates`) | **Find & Clean Copies** | Checks file sizes, filters candidates, and runs MD5 hash comparisons with a **live progress bar**. |
| **`💾 Disk Space Analyzer`** (`/disk`) | **Find Storage Hogs** | Scans directories (skipping locked system files and AppData) to display the **Top 10 largest folders/files** instantly. |
| **`🔌 Open Ports Scan`** (`/ports`) | **Listening Ports Check** | Scans listening TCP ports and links them to process names and PIDs. |
| **`📶 Network & Speed Test`** (`/network`) | **IP & Download Speed** | Resolves local/public IPs and runs a download speed test from Cloudflare CDN in Mbps. |
| **`📶 Wi-Fi Tool`** (`/wifi`) | **Saved Passwords Reader** | Queries and prints all saved Wi-Fi profiles and plain-text passwords. |
| **`🤖 System Health Advisor`** (`/advisor`) | **Local Maintenance Agent** | Performs a rule-based diagnostic check on storage, battery health, databases, and temporary bloat. |

---

## 3. Bug Resolution & Stability Log

To make Ryuu stable and resilient on your laptop, we fixed several critical bugs that were causing crashes:

### 🐛 Bug 1: Raw Mode Keyboard Input Conflict
* **Symptom:** When prompts asked for input (like entering a path or commit message), typing letters triggered random arrow menu operations and crashed.
* **Cause:** The background terminal keypress listener was never removed when executing sub-commands, causing key events to fire in both modules simultaneously.
* **Fix:** We implemented state-based transition handlers. The CLI now completely detaches menu event listeners the moment a command starts, and safely re-attaches them only when you return to the menu.

### 🐛 Bug 2: PowerShell Variable drive-colon Parsing
* **Symptom:** Running `/doctor`, `/duplicates`, or `/advisor` threw `Variable reference is not valid: InvalidVariableReferenceWithDrive`.
* **Cause:** In PowerShell double-quoted strings, a colon following a variable name (e.g. `$index:` or `$freePct:`) is interpreted as a scope/drive namespace (like `$env:Path`).
* **Fix:** Wrapped variables in explicit subexpressions: `$($index):` and `$($freePct):` to force PowerShell to treat the colon as literal text.

### 🐛 Bug 3: Built-in Read-Only `$PID` Variable Collision
* **Symptom:** Running `/ports` threw `Cannot overwrite variable PID because it is read-only or constant`.
* **Cause:** PowerShell reserves `$PID` as an automatic system variable containing the process ID of the active PowerShell session host.
* **Fix:** Renamed the local variable from `$pid` to `$owningPid`.

### 🐛 Bug 4: NPM Execution Policy Block
* **Symptom:** Running `/doctor` threw a security exception warning that `npm.ps1` cannot be loaded because script execution is disabled on the system.
* **Cause:** Node installs a `.ps1` script for npm on Windows, which gets blocked by default PowerShell security policies.
* **Fix:** Changed the call from `& npm` to `& npm.cmd` which runs the batch executable and bypasses script execution policies entirely.

### 🐛 Bug 5: Spinner Loop on Sync Tasks
* **Symptom:** Selecting `/disk` printed the results successfully, but the loading spinner `Calculating directories size...` kept spinning at the bottom in an infinite loop.
* **Cause:** The spinner interval timer was never stopped at the end of the `/disk` action block.
* **Fix:** Added the missing `stopSpinner("Scan complete")` call.

---

## 4. Packaging and Distribution Assets

Ryuu is equipped for easy distribution and sharing with other developers:
1. 📄 **[`README.md`](file:///C:/Users/Rahul/OneDrive/Desktop/rahulrc/ryuu/README.md)**: A markdown user manual ready for GitHub, explaining features, controls, and installation.
2. ⚙️ **[`install.bat`](file:///C:/Users/Rahul/OneDrive/Desktop/rahulrc/ryuu/install.bat)**: A double-click batch installer for Windows. It checks if Node.js is on the machine, downloads it via winget if missing, and automatically links Ryuu globally.
3. 🌐 **NPM Publishing Guide**: In the README, we mapped out the steps to upload this tool to the public npmjs registry under your name, allowing anyone to install it with:
   ```bash
   npm install -g rahul-ryuu
   ```
