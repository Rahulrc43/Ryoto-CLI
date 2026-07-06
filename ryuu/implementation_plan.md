# Ryoto CLI v1.1.7 Implementation Plan

This implementation plan details the new features and UX enhancements scheduled for the **v1.1.7** release cycle, maintaining the strict **zero external dependencies** architecture.

---

## 1. Proposed Changes

We will implement the new features and utility updates in two distinct modules:

### A. Core Utility Helpers & CLI Enhancements (`lib/helpers.js`)
* **📦 Tiny Arguments Parser:**
  * Build a native command-line argument parser to extract key/value pairs (e.g. `--path="C:\..."`) and boolean flags (e.g. `--fix` or `-f`).
* **🔔 Zero-Dependency NPM Auto-Updater Check:**
  * Trigger an asynchronous background query to `https://registry.npmjs.org/@rahulrc48/ryoto/latest` on boot.
  * Compare the registry's version string with the local `package.json` version and display a notice if a newer release is published.
* **📂 Auto-Reveal in File Explorer:**
  * Add a helper that executes `explorer.exe /select,"<filepath>"` to automatically pop open File Explorer with the generated output file highlighted.

---

### B. System Tools & Interactive Features (`commands/`)
* **`commands/git.js` (Remote Safety Check):**
  * Check if a remote origin is configured before running `git push`. If none is found, prompt the user to link a remote URL (`git remote add origin`) or commit locally only.
* **`commands/disk.js` (Interactive Directory Navigation):**
  * After displaying the Top 10 largest folders, prompt the user for an index (1-10) to recursively "drill down" and scan that subfolder.
* **`commands/clean.js` (Recycle Bin Cleaner):**
  * Add native Windows Recycle Bin cleaning via the PowerShell command `Clear-RecycleBin -Force -ErrorAction SilentlyContinue`.
* **`commands/benchmark.js` (Performance Report Export):**
  * Save benchmark scores to a Markdown report (`Performance-Report.md`) on the user's Desktop and trigger the Auto-Reveal helper.
* **`commands/battery.js` [NEW] (Advanced Battery Reports):**
  * Generate a native HTML battery diagnostics report via `powercfg /batteryreport` to `%TEMP%\battery-report.html` and open it in the default browser.
* **`commands/hosts.js` [NEW] (Hosts File & Telemetry Manager):**
  * Read and edit the local hosts file (`C:\Windows\System32\drivers\etc\hosts`).
  * Support adding/removing mappings and applying a Windows telemetry IP blocklist.
  * **Safety:** Save a backup copy under `~/.ryoto/backups/hosts.bak` before making any writes.
* **`commands/wifi.js` [NEW] (Wi-Fi QR Code Sharer):**
  * Generate a standard Wi-Fi sharing schema (`WIFI:S:<SSID>;T:WPA;P:<PASSWORD>;;`).
  * Write a local HTML page on the Desktop containing a Google Charts QR Code API frame, and launch it in the browser so users can scan it with their phones.

---

## 2. Verification Plan

### Automated Tests
* Run `node -e "require('./package.json')"` and `node index.js --version` to verify code parsing.
* Test individual commands using the CLI runner.

### Manual Verification
* Try `/git` in a fresh unlinked folder to verify the remote URL prompt and fallback.
* Verify that generated report zips and benchmark markdown files pop open the File Explorer window with the files highlighted.
* Scan the generated Wi-Fi HTML QR code with a phone to verify it connects to the target Wi-Fi SSID.
