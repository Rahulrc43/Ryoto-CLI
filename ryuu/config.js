const os = require('os');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(os.homedir(), '.ryotorc');
const HOLDING_DIR = path.join(os.homedir(), '.ryoto', 'holding');
const LEGACY_CONFIG_PATH = path.join(os.homedir(), '.ryuurc');
const LEGACY_HOLDING_DIR = path.join(os.homedir(), '.ryuu');

// Best-effort migration of legacy config and holding vault folders
try {
  if (fs.existsSync(LEGACY_CONFIG_PATH) && !fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(LEGACY_CONFIG_PATH, CONFIG_PATH);
  }
  const ryotoDir = path.join(os.homedir(), '.ryoto');
  if (fs.existsSync(LEGACY_HOLDING_DIR) && !fs.existsSync(ryotoDir)) {
    const copyRecursive = (src, dest) => {
      const exists = fs.existsSync(src);
      const stat = exists && fs.statSync(src);
      if (stat && stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
          copyRecursive(path.join(src, child), path.join(dest, child));
        });
      } else if (exists) {
        fs.copyFileSync(src, dest);
      }
    };
    copyRecursive(LEGACY_HOLDING_DIR, ryotoDir);
  }
} catch (e) {}

const DEFAULTS = {
  cleanExcludes: [],
  diskExcludes: ['System Volume Information', '$RECYCLE.BIN', 'AppData', 'Local Settings', 'Application Data', 'node_modules', '.git'],
  duplicateExcludes: ['System Volume Information', '$RECYCLE.BIN', 'AppData', 'node_modules', '.git'],
  defaultGitRemote: 'origin',
  telemetry: false,
  holdingExpiryHours: 168
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileData = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...DEFAULTS, ...JSON.parse(fileData) };
    } catch (e) {
      // Return defaults if parsing fails
    }
  }
  return { ...DEFAULTS };
}

function saveConfig(config) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {}
}

// Ensure holding directory exists
try {
  fs.mkdirSync(HOLDING_DIR, { recursive: true });
} catch (e) {}

module.exports = {
  loadConfig,
  saveConfig,
  CONFIG_PATH,
  HOLDING_DIR
};
