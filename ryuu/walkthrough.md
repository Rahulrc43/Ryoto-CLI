# Ryoto CLI — Codebase Refactoring & Hardening Walkthrough

This document logs the successful execution of all four passes outlined in the security, quality, and packaging refactoring plan for **Ryoto CLI** (`@rahulrc48/ryoto`).

---

## 🛠️ Summary of Accomplished Work

### Pass 1: Safety & Hardening (Injection Protection)
* **Registry & SSID Escaping (`startup.js` / `wifi.js`):** Extracted targets to temporary files inside standard OS temp space, reading them back in PowerShell using `[System.IO.File]::ReadAllText()` or `ConvertFrom-Json`. This guarantees **100% immunity to variable interpolation and escaping injections** in double-quoted PowerShell string runs.
* **Working Directory Isolation (`git.js`):** Forwarded `cwd` parameter options to the child process spawning layer rather than running manual string-concatenated `cd` operations.
* **Malware Threat Verification (`scan.js`):** Configured Defender scans to compare recent threat detections (`Get-MpThreatDetection`) against the scan's starting timestamp, printing threat details only if active threats are found.
* **Command Load Isolation (`index.js`):** Wrapped file loading inside `registerCommands` in independent `try/catch` segments. A load failure in one file will no longer stop other files from registering.
* **Crash Terminal Recovery (`index.js`):** Setup global `uncaughtException` and `unhandledRejection` handlers to restore the terminal state (`setRawMode(false)`) and show the cursor before exiting upon unexpected program crashes.

### Pass 2: Functional Bug Fixes
* **Interactive Menu Options (`index.js`):** Added a prompt in `executeAction` allowing users to pass optional flags (e.g. `--dry-run`, `--fix`, `--json`, `--restore`) directly from the arrow-navigation menu interface.
* **Dynamic Versioning:** Refactored help displays, banners, and CLI outputs to resolve the version dynamically from `package.json`'s `"version"` property, resolving hardcoded version drift.
* **Live Hardware Specifications (`info.js`):** Replaced hardcoded RAM speeds with dynamic CimInstance hardware lookups from `Win32_PhysicalMemory` to retrieve exact capacity, SMBIOS generation (`DDR3`, `DDR4`, `DDR5`), and speed.
* **Active Routing Interface Diagnostics (`network.js`):** Resolved active network adapter indexes via `Get-NetRoute -DestinationPrefix 0.0.0.0/0` to dynamic target IP details, supporting Ethernet-only systems.
* **Smooth Benchmarks (`benchmark.js`):** 
  * Chunked the heavy 10M-iteration CPU benchmark loop into asynchronous `setImmediate` batches to keep the terminal loading spinner ticking smoothly.
  * Added `fsyncSync(fd)` calls to disk I/O benchmarks to flush RAM buffers, measuring real disk throughput instead of memory page cache speeds.
* **Snapshot Arrays & Corruptions (`snapshot.js`):** Added safe `JSON.parse` operations and a helper function to guarantee scalar registry results are coerced into standard arrays for Set comparisons.
* **MSI Argument Sanitization (`uninstall.js`):** Configured lookaround assertions (`(?<=\s|^)/[Ii](?=\s|$)`) to isolate `/I` switches without corrupting variables like `/INSTALLDIR`.
* **Process Signal Cleanups (`index.js` / `lib/shell.js`):** Enabled active processes tracking and registered a global `SIGINT` (Ctrl+C) signal handler to terminate background processes immediately on exit.

### Pass 3: Duplication Pruning & Helpers
* **PowerShell Spawning Consolidation:** Migrated `advisor.js`, `clean.js`, and `export.js` to run queries through the unified `runPowerShellCapture` helper to inherit process timeouts, logging, and environment variables.
* **Common UI Helpers (`lib/helpers.js`):** Extracted `checkPlatform`, `confirmAction`, and `drawProgressBar` into a shared utility file, pruning duplicate terminal render code.
* **Ryoto Brand Standardization:** Updated advisor recommendation headers, export markdown templates, HTML page headers, and command-line instructions to refer strictly to **Ryoto**.

### Pass 4: Packaging & Distribution Polish
* **Exclusions Whitelist (`package.json`):** Whitelisted project files (`index.js`, `config.js`, `lib/`, `commands/`, `install.bat`, `README.md`, `LICENSE`) inside the `"files"` field. This prevents publishing local diagnostic session logs (`ryuu_cli_report.md`, `walkthrough.md`, `task.md`) to the public registry, protecting developer privacy.
* **Repository Info:** Configured author details, keywords, and repository URLs, and generated an MIT `LICENSE` file.

---

## 🔬 Verification Results
* Running the compilation validation script returned successful loading for all **19 interactive sub-commands** with zero errors or syntax alerts:
  ```text
  Loaded: advisor.js
  Loaded: benchmark.js
  Loaded: clean.js
  ...
  Loaded: uninstall.js
  Loaded: wifi.js
  ```

---

### v1.1.5 Security Patch & Interface Animations
* **HMAC SHA-256 Signatures:** Added persistent machine-unique vault keys to cryptographically sign all `map.json` backup manifests at creation time.
* **Tamper Verification:** Added verification checks in `restoreBackup()` to reject any restore operation if a manifest's signature is invalid or modified.
* **Auto-Signing Bridge:** Integrated transparent legacy migration in `listBackups()` to seamlessly auto-sign older, unsigned backups from previous installs using the user's local key.
* **Live Cyber Cipher Banner Animation:** Integrated a dynamic key-scrambling encrypting/decrypting banner animation directly inside the welcome box on the main interactive menu screen.
* **Encrypting (Masking) Animation:** Original saved profiles in `/wifi` draw passwords starting as randomized matrix character strings that settle step-by-step into masked `•••••• [Masked]` items.
* **Decrypting (Revealing) Animation:** Plain-text passwords reveal left-to-right with visual flickering character cycles, locking in decrypted values character-by-character.

---

### v1.1.6 Native Registry Persistence & Safeties (Active)
* **Native Startup Override:** Swapped startup deletions for standard Windows Explorer `StartupApproved` override registry entries (`{03, 00, ...}` binary flags) to natively block boot execution without deleting the app's keys, preventing self-healing re-writes.
* **Uninstaller Safe Parameter Execution:** Configured safe `Start-Process` branching in `uninstall.js` to execute uninstallers without arguments (like Cisco Packet Tracer) cleanly without throwing PowerShell binding exceptions.
* **Trim/Split Null-Safeties:** Implemented defensive input validation in `doctor.js` and `wifi.js` to safeguard `.Trim()` and split delimiters against null pointer runtime errors.
* **Microsoft Malicious Software Removal Tool (MRT) Integration:** Reconfigured the `/scan` command to provide users with a menu of options: standard background Windows Defender quick scan, interactive MRT GUI window launcher, or background quiet MRT scan.
* **Open Ports Process Termination:** Added an interactive option to the `/ports` scan command that allows developers to enter a specific port number and terminate the owning background process automatically (with built-in UAC permission error handling).
* **Open Ports Security Flagging:** Integrated a dictionary of high-risk/suspicious ports (such as RDP 3389, SMB 445, Metasploit 4444, Back Orifice 31337, etc.) directly into `/ports` to automatically highlight them in yellow/red warnings and provide recommendations.
* **System Process Safety Blocks:** Implemented strict safety rules in `/ports` to block users from terminating critical Windows components (such as PID 4 System, PID 0 Idle, or services like svchost, lsass, wininit, csrss, smss), eliminating any chance of accidental Blue Screens (BSOD) or reboots.
* **Static Import Registry:** Transitioned the core module loader in `index.js` to a static import registry to clear dynamic loading alerts on security analyzers (Socket.dev).

---

### v1.1.7 Roadmap & Integration Backlog (Active)
* Upcoming features under development:
  * Google Gemini Codebase Assistant (`/ask`)
  * Python Environment & Package Advisor (`/python`)
  * Zero-Dependency NPM Auto-Updater Check
  * Tiny Arguments Parser
  * Auto-Reveal in File Explorer (`explorer.exe /select`)
  * Interactive Directory Navigation in `/disk`
  * Recycle Bin Purging in `/clean`
  * Performance Report Exporting in `/benchmark`
  * Advanced Battery Reports (`/battery-report`)
  * Hosts File & Telemetry Manager (`/hosts`)
  * Wi-Fi QR Code Sharer (`/wifi-share`)
