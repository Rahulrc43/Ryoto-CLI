const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

module.exports = {
  name: '/benchmark',
  menuName: '⚡  Hardware Benchmark    ',
  desc: 'Run a synthetic CPU math loop and sequential Disk write/read speed test',
  run: async (context) => {
    console.log(`\n${context.esc.yellow}${context.esc.bold}[BENCHMARK] Launching hardware performance tests...${context.esc.reset}\n`);
    
    // 1. CPU Test
    console.log("Running synthetic CPU math loop (10,000,000 operations)...");
    context.startSpinner("Benchmarking CPU");
    
    const cpuTimeMs = await new Promise((resolve) => {
      const start = performance.now();
      let sum = 0;
      const totalOps = 10000000;
      const batchSize = 1000000; // Yield to event loop every 1M iterations to keep spinner ticking
      let currentOps = 0;

      function runBatch() {
        const limit = Math.min(currentOps + batchSize, totalOps);
        for (let i = currentOps; i < limit; i++) {
          sum += Math.sin(i) * Math.cos(i);
        }
        currentOps = limit;
        if (currentOps < totalOps) {
          setImmediate(runBatch);
        } else {
          resolve(performance.now() - start);
        }
      }
      setImmediate(runBatch);
    });
    
    context.stopSpinner("CPU benchmarking complete");
    console.log(`  CPU Calculation Time : ${context.esc.bold}${cpuTimeMs.toFixed(1)} ms${context.esc.reset}`);

    // 2. Disk Test
    console.log("\nRunning sequential Disk IO test (writing & reading 25MB buffer)...");
    context.startSpinner("Benchmarking Disk IO");
    
    const tempFile = path.join(os.tmpdir(), 'ryoto-bench.bin');
    const bufferSize = 25 * 1024 * 1024; // 25MB
    const buffer = Buffer.alloc(bufferSize, 'R');
    
    let writeTimeMs = 0;
    let readTimeMs = 0;

    try {
      // Open file descriptor for direct synchronous write/read operations
      const fd = fs.openSync(tempFile, 'w+');
      
      // Write test
      const writeStart = performance.now();
      fs.writeSync(fd, buffer, 0, bufferSize, 0);
      fs.fsyncSync(fd); // Force OS to flush RAM buffers to physical storage disk
      const writeEnd = performance.now();
      writeTimeMs = writeEnd - writeStart;
      
      // Read test
      const readStart = performance.now();
      const readBuffer = Buffer.alloc(bufferSize);
      fs.readSync(fd, readBuffer, 0, bufferSize, 0);
      const readEnd = performance.now();
      readTimeMs = readEnd - readStart;
      
      fs.closeSync(fd);
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e) {}
    }
    
    const writeSpeedMBs = (25 / (writeTimeMs / 1000)).toFixed(1);
    const readSpeedMBs = (25 / (readTimeMs / 1000)).toFixed(1);
    
    context.stopSpinner("Disk benchmarking complete");
    console.log(`  Disk Write Speed     : ${context.esc.bold}${writeSpeedMBs} MB/s${context.esc.reset} (${writeTimeMs.toFixed(1)} ms)`);
    console.log(`  Disk Read Speed      : ${context.esc.bold}${readSpeedMBs} MB/s${context.esc.reset} (${readTimeMs.toFixed(1)} ms)`);

    // 3. Score Calculation
    const cpuScore = Math.max(10, Math.round(100000 / cpuTimeMs));
    const diskScore = Math.round((parseFloat(writeSpeedMBs) + parseFloat(readSpeedMBs)) / 10);
    const totalScore = cpuScore + diskScore;

    console.log(`\n${context.esc.cyan}┌── HARDWARE PERFORMANCE SCORE ───────────────────────────────────────┐${context.esc.reset}`);
    console.log(`  Synthetic CPU Rating : ${cpuScore}`);
    console.log(`  Synthetic Disk Rating: ${diskScore}`);
    console.log(`  Overall Performance  : ${context.esc.bold}${totalScore} Points${context.esc.reset}`);
    
    let tier = "Standard Edition";
    if (totalScore > 1200) { tier = "Extreme Master Edition"; }
    else if (totalScore > 600) { tier = "Pro Gaming Edition"; }
    console.log(`  System Tier Class    : ${context.esc.hiCyan}${tier}${context.esc.reset}`);
    console.log(`${context.esc.cyan}└─────────────────────────────────────────────────────────────────────┘${context.esc.reset}\n`);
  }
};
