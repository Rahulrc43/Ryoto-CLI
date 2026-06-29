const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { loadConfig, HOLDING_DIR } = require('../config');
const { moveToHolding } = require('../lib/vault');
const stats = require('../lib/stats');
const { checkPlatform, confirmAction, drawProgressBar } = require('../lib/helpers');

const protectedPatterns = [
  /[\\\/]\.git[\\\/]/i,
  /[\\\/]node_modules[\\\/]/i,
  /C:\\Windows\\/i,
  /C:\\Program Files\\/i,
  /C:\\Program Files \(x86\)\\/i,
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /yarn\.lock$/i
];

function isProtected(filePath) {
  return protectedPatterns.some(pat => pat.test(filePath));
}

function walkDir(dir, config, fileList = []) {
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (config.duplicateExcludes.includes(file) || file.startsWith('.')) return;
        walkDir(filePath, config, fileList);
      } else {
        fileList.push({ path: filePath, size: stat.size });
      }
    });
  } catch (e) {}
  return fileList;
}

function getFileHash(filePath) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', () => resolve(null)); // Resolve null on locked files
  });
}

module.exports = {
  name: '/duplicates',
  menuName: '🔍  Duplicate Finder      ',
  desc: 'Scan a folder recursively to find and delete duplicate files (backed up to vault)',
  run: async (context) => {
    console.log(`\n${context.esc.yellow}${context.esc.bold}[DUPLICATE FINDER] Entering duplicate scan module...${context.esc.reset}\n`);
    let dupPath = await context.askQuestion('Enter folder path to scan (Press Enter for current directory): ');
    if (!dupPath) dupPath = process.cwd();

    if (!fs.existsSync(dupPath)) {
      console.log(`${context.esc.red}Error: Path "${dupPath}" does not exist.${context.esc.reset}\n`);
      return;
    }

    console.log(`Scanning "${dupPath}" recursively (this might take a few moments)...`);
    context.startSpinner("Listing files in directory");

    const config = loadConfig();
    const allFiles = walkDir(dupPath, config);
    context.stopSpinner(`Scan complete. Found ${allFiles.length} files.`);

    // Group files by size
    const sizeGroups = {};
    allFiles.forEach(f => {
      if (f.size === 0) return; // Skip empty files
      if (!sizeGroups[f.size]) sizeGroups[f.size] = [];
      sizeGroups[f.size].push(f.path);
    });

    // Flatten candidate files (sharing a size)
    const candidates = [];
    Object.keys(sizeGroups).forEach(size => {
      if (sizeGroups[size].length > 1) {
        candidates.push(...sizeGroups[size]);
      }
    });

    if (candidates.length === 0) {
      console.log(`${context.esc.green}Awesome! No duplicate files found.${context.esc.reset}\n`);
      return;
    }

    console.log(`Found ${candidates.length} potential duplicate candidates of identical sizes. Hashing candidates...`);

    const hashes = {};
    let processed = 0;
    const total = candidates.length;

    for (const file of candidates) {
      const hash = await getFileHash(file);
      if (hash) {
        if (!hashes[hash]) hashes[hash] = [];
        hashes[hash].push(file);
      }
      processed++;

      const fileBase = path.basename(file);
      const displayFile = fileBase.length > 30 ? "..." + fileBase.slice(-27) : fileBase;
      drawProgressBar(context.esc, processed, total, `hashed - ${displayFile}`);
    }
    console.log('\n');

    // Filter hashes that have duplicates
    const duplicates = {};
    let totalWastedBytes = 0;
    const deletablePaths = [];

    console.log(`Analyzing duplicate groups for system protected path protections...`);
    Object.keys(hashes).forEach(h => {
      if (hashes[h].length > 1) {
        duplicates[h] = hashes[h];
        try {
          const size = fs.statSync(hashes[h][0]).size;
          totalWastedBytes += size * (hashes[h].length - 1);
          
          // Keep the first item, mark others as duplicates unless protected
          hashes[h].slice(1).forEach(file => {
            if (isProtected(file)) {
              console.log(`  ${context.esc.yellow}[PROTECTED] Skipping duplicate deletion candidate: ${file}${context.esc.reset}`);
            } else {
              deletablePaths.push(file);
            }
          });
        } catch (e) {}
      }
    });

    if (Object.keys(duplicates).length === 0) {
      console.log(`\n${context.esc.green}Awesome! No identical duplicate files found.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.cyan}${context.esc.bold}Found identical duplicate files:${context.esc.reset}`);
    let idx = 1;
    Object.keys(duplicates).forEach(h => {
      console.log(`\n${context.esc.yellow}Identical Group (MD5: ${h}):${context.esc.reset}`);
      duplicates[h].forEach((file) => {
        try {
          const sizeMB = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
          const protPrefix = isProtected(file) ? `[PROTECTED - KEPT] ` : '';
          console.log(`  [${idx}] ${protPrefix}${file} (${sizeMB} MB)`);
          idx++;
        } catch (e) {}
      });
    });

    if (deletablePaths.length === 0) {
      console.log(`\n${context.esc.green}All found duplicates are system-protected or configuration files. No actions required.${context.esc.reset}\n`);
      return;
    }

    const wastedMB = (totalWastedBytes / 1024 / 1024).toFixed(2);
    console.log(`\n${context.esc.bold}Total potential space reclaimed: ${wastedMB} MB${context.esc.reset}`);
    
    const delConfirm = await context.askQuestion(`\nDo you want to clean duplicates by keeping only one copy of each? (y/n): `);
    if (delConfirm.toLowerCase() === 'y' || delConfirm.toLowerCase() === 'yes') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionHoldingDir = path.join(HOLDING_DIR, `dup-${timestamp}`);
      fs.mkdirSync(sessionHoldingDir, { recursive: true });

      const mapInfo = {
        timestamp: new Date().toISOString(),
        category: 'Duplicates',
        files: []
      };

      let deletedCount = 0;
      deletablePaths.forEach(p => {
        const moved = moveToHolding(p, sessionHoldingDir, mapInfo);
        if (moved) {
          deletedCount++;
        }
      });

      // Write map.json
      fs.writeFileSync(path.join(sessionHoldingDir, 'map.json'), JSON.stringify(mapInfo, null, 2), 'utf8');

      // Update statistics
      stats.freedMB += parseFloat(wastedMB);
      stats.duplicatesDeleted += deletedCount;
      if (mapInfo.files.length > 0) {
        stats.backupsCreated++;
      }

      console.log(`\n${context.esc.green}Successfully cleaned ${deletedCount} duplicates (moved to vault for safety).${context.esc.reset}`);
      console.log(`${context.esc.cyan}Tip: You can restore these at any time by running /clean --restore${context.esc.reset}\n`);
    } else {
      console.log(`\n${context.esc.cyan}Duplicate cleanup cancelled.${context.esc.reset}\n`);
    }
  }
};
