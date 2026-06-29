const fs = require('fs');
const path = require('path');
const os = require('os');

const TREND_FILE = path.join(os.homedir(), '.ryoto', 'trends.jsonl');

function logTrendEntry(entry) {
  try {
    fs.mkdirSync(path.dirname(TREND_FILE), { recursive: true });
    
    let entries = [];
    if (fs.existsSync(TREND_FILE)) {
      const content = fs.readFileSync(TREND_FILE, 'utf8');
      entries = content.split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l));
    }
    
    entries.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
    
    // Cap to last 100 entries to prevent infinite growth
    if (entries.length > 100) {
      entries = entries.slice(-100);
    }
    
    const lines = entries.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(TREND_FILE, lines, 'utf8');
  } catch (e) {}
}

function getTrendEntries() {
  if (!fs.existsSync(TREND_FILE)) return [];
  try {
    const content = fs.readFileSync(TREND_FILE, 'utf8');
    return content.split('\n').filter(l => l.trim().length > 0).map(l => JSON.parse(l));
  } catch (e) {
    return [];
  }
}

module.exports = { logTrendEntry, getTrendEntries };
