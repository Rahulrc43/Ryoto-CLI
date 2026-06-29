# Ryoto / Ryuu CLI — Full Codebase Refactoring & Hardening Plan

This implementation plan addresses the code quality, safety, security, and functional bugs found in the codebase. 

---

## 1. User Review Required

> [!IMPORTANT]
> **Branding & Namespaces:** The npm package and command is named `ryoto`, but internally the config and backup folders are stored in `~/.ryuu/`. 
> * **Proposed Solution:** Standardize all user-facing `--version`, `--help`, banner texts, and command-line outputs to print **`Ryoto`**. Keep the internal directory paths as `~/.ryuu` and file as `~/.ryuurc` to maintain backward-compatibility with existing user vaults and settings without losing data.

---

## 2. Proposed Changes

We will execute the improvements in four distinct passes:

### Pass 1: Safety & Hardening (Zero Behavior Change)
* **`commands/startup.js`:** Replace inline double-quoted string interpolations with secure temp-file buffer parameter passing for `Remove-ItemProperty` and `Remove-Item` actions.
* **`commands/wifi.js`:** Route the SSID `profileName` query through a temp file or native PowerShell parameter binding to block injection vectors. Replace the global monkey-patched `String.prototype.padRight` with the standard ES6 `String.prototype.padEnd`.
* **`commands/git.js`:** Safely resolve `repoPath` when executing subprocess calls by using local file buffers or properly escaped directory scoping.
* **`commands/scan.js`:** Parse the actual output return codes and streams of `Start-MpScan` to confirm whether threats were found, rather than unconditionally logging a success message.
* **`index.js`:** 
  * Wrap each individual command file loading inside `registerCommands()` with its own isolated `try/catch` block so a failure in one command does not block the entire application registration alphabetically.
  * Register global `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers to restore the terminal raw mode (`setRawMode(false)`) and show the cursor before exiting upon unexpected crashes.

### Pass 2: Functional Bug Fixes
* **Menu Command Arguments (`index.js`):** Update the arrow-navigation menu action `executeAction` to accept user flags or support parameter input prompts so that commands like `/clean --dry-run` or `/doctor --fix` can be triggered directly from the interactive UI.
* **Version Harmonization:** Extract the version number directly from `package.json` dynamically inside `index.js`, completely eliminating hardcoded version drift.
* **`commands/info.js`:** Replace the hardcoded RAM specifications with dynamic CimInstance hardware queries (`Win32_PhysicalMemory`) to accurately print RAM capacity, speed, and channel configurations.
* **`commands/network.js`:** Query active interface adapters dynamically instead of hardcoding `-InterfaceAlias "Wi-Fi"` to support Ethernet-only environments.
* **`commands/benchmark.js`:** 
  * Chunk the heavy synchronous 10M-iteration CPU math loop into asynchronous `setImmediate` batches so the terminal loading spinner can continue ticking instead of freezing.
  * Flush/unbuffer the temporary file used in disk I/O benchmarks to measure actual disk read/write throughput instead of OS page-cache memory speeds.
* **`commands/snapshot.js`:** Add `try/catch` blocks around JSON parsing of snapshot files. Wrap the returned PowerShell array outputs with a check to guarantee they are parsed as an array (resolving scalar vs. array JSON conversions).
* **`commands/uninstall.js`:** Refactor the `$args -replace "/I", "/X"` logic to use strict regex word boundary limits (`\b/I\b`) to prevent corrupting directory variables like `/INSTALLDIR`.
* **Subprocess Signals:** Register explicit `SIGINT` (Ctrl+C) listeners to properly clean up and terminate orphaned child PowerShell tasks when users force-quit the tool.

### Pass 3: Duplication Pruning & Helpers
* **Spawning Consolidation:** Refactor `advisor.js`, `clean.js`, and `export.js` to run their primary system queries through the unified `runPowerShellCapture()` helper to inherit process timeouts and log error streams.
* **Extraction of Boilerplate:** Extract the repetitive `os.platform() !== 'win32'` platform guards, the `y/n` confirmation handlers, and progress-bar animations into shared helper files inside `lib/`.

### Pass 4: Packaging & Distribution Polish
* **Publish Exclusions:** Configure a `"files"` field in `package.json` to publish only required code files (`index.js`, `config.js`, `lib/`, `commands/`), completely excluding local session-log markdown files (`task.md`, `walkthrough.md`) to protect personal path logs.
* **Repository Info:** Add author, keywords, repository, and a `LICENSE` file.

---

## 3. Verification Plan

### Automated Tests
* Run `node -e "require('./index.js')"` to verify index bootstrapping.
* Execute `npm run lint` or custom script compilation loops.

### Manual Verification
* Trigger the new interactive flags directly from the arrow menu.
* Test `/env` backup and restore rollbacks.
* Run duplicate tests on folders containing spaces or special characters to verify path-escaping protections.
