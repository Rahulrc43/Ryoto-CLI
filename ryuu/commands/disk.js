const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../config');

function getFolderSize(dir, config) {
  let totalSize = 0;
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (config.diskExcludes.includes(file) || file.startsWith('.')) return;
        totalSize += getFolderSize(filePath, config);
      } else {
        totalSize += stat.size;
      }
    });
  } catch (e) {}
  return totalSize;
}

module.exports = {
  name: '/disk',
  menuName: '💾  Disk Space Analyzer   ',
  desc: 'List the Top 10 largest folders/files in a path (WinDirStat mode - Node-native)',
  run: async (context) => {
    console.log(`\n${context.esc.yellow}${context.esc.bold}[DISK SPACE] Entering disk analysis module...${context.esc.reset}\n`);
    let diskPath = await context.askQuestion(`Enter folder path to analyze (Press Enter for current directory): `);
    if (!diskPath) diskPath = process.cwd();

    const config = loadConfig();

    let inDiskAnalysis = true;
    while (inDiskAnalysis) {
      if (!fs.existsSync(diskPath)) {
        console.log(`${context.esc.red}Error: Path "${diskPath}" does not exist.${context.esc.reset}\n`);
        return;
      }

      console.log(`\nAnalyzing folder size and directory structure of "${diskPath}"...`);
      context.startSpinner("Calculating directories size");

      let items = [];
      try {
        items = fs.readdirSync(diskPath);
      } catch (err) {
        context.stopSpinner("Failed to read folder");
        console.log(`${context.esc.red}Error reading directory "${diskPath}": ${err.message}${context.esc.reset}\n`);
        return;
      }
      
      const folders = [];
      const files = [];

      items.forEach(item => {
        const fullPath = path.join(diskPath, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (config.diskExcludes.includes(item) || item.startsWith('.')) return;
            const size = getFolderSize(fullPath, config);
            folders.push({ name: item, path: fullPath, size });
          } else {
            files.push({ name: item, size: stat.size });
          }
        } catch (e) {}
      });

      context.stopSpinner("Scan complete");

      // Sort folders and files
      const topFiles = files.sort((a, b) => b.size - a.size).slice(0, 10);
      const topFolders = folders.sort((a, b) => b.size - a.size).slice(0, 10);

      // Display Top 10 Files
      console.log(`${context.esc.cyan}┌── LARGEST FILES (TOP 10) ──────────────────────────────────────────┐${context.esc.reset}`);
      if (topFiles.length === 0) {
        console.log(`  No files found.`);
      } else {
        topFiles.forEach(f => {
          const sizeMB = (f.size / 1024 / 1024).toFixed(2);
          const name = f.name.length > 45 ? f.name.slice(0, 42) + "..." : f.name;
          console.log(`  ${name.padEnd(47)} : ${sizeMB} MB`);
        });
      }
      console.log(`${context.esc.cyan}└────────────────────────────────────────────────────────────────────┘${context.esc.reset}`);

      console.log();

      // Display Top 10 Folders
      console.log(`${context.esc.cyan}┌── LARGEST FOLDERS (TOP 10) ────────────────────────────────────────┐${context.esc.reset}`);
      if (topFolders.length === 0) {
        console.log(`  No subfolders found.`);
      } else {
        topFolders.forEach((f, idx) => {
          const sizeMB = (f.size / 1024 / 1024).toFixed(2);
          const name = f.name.length > 42 ? f.name.slice(0, 39) + "..." : f.name;
          const numStr = `[${idx + 1}]`.padEnd(5);
          console.log(`  ${numStr}${name.padEnd(42)} : ${sizeMB} MB`);
        });
      }
      console.log(`${context.esc.cyan}└────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);

      console.log(`Actions:`);
      console.log(`  * Enter a folder index (1-${topFolders.length}) to navigate into it.`);
      console.log(`  * Enter ".." to go up to the parent directory.`);
      console.log(`  * Press Enter or type "exit" to quit the disk analyzer.`);

      const action = await context.askQuestion(`Choose action: `);
      const trimmedAction = action.trim().toLowerCase();

      if (!trimmedAction || trimmedAction === 'exit' || trimmedAction === 'q') {
        inDiskAnalysis = false;
      } else if (trimmedAction === '..') {
        diskPath = path.dirname(diskPath);
      } else {
        const idx = parseInt(trimmedAction, 10);
        if (idx >= 1 && idx <= topFolders.length) {
          diskPath = topFolders[idx - 1].path;
        } else {
          console.log(`${context.esc.red}Invalid selection.${context.esc.reset}`);
        }
      }
    }
  }
};
