const os = require('os');
const { runPowerShellCapture } = require('../lib/shell');

module.exports = {
  name: '/processes',
  menuName: '🌳  Memory Process Tree   ',
  desc: 'Show a visual hierarchical process tree with active RAM usage',
  run: async (context) => {
    if (os.platform() !== 'win32') {
      console.log(`\n${context.esc.red}Error: Hierarchical process trees are only supported on Windows.${context.esc.reset}\n`);
      return;
    }

    console.log(`\n${context.esc.yellow}${context.esc.bold}[PROCESS TREE] Generating memory hierarchy map...${context.esc.reset}\n`);
    
    const result = await context.runTask("Gathering memory process tree", async () => {
      const procScript = `
        $processes = Get-CimInstance -ClassName Win32_Process | Select-Object ProcessId, ParentProcessId, Name, @{Name='WS_MB';Expression={[math]::Round($_.WorkingSetSize / 1MB, 2)}}
        $procMap = @{}
        foreach ($p in $processes) { $procMap[$p.ProcessId] = $p }
        $roots = [System.Collections.Generic.List[object]]::new()
        $children = @{}
        foreach ($p in $processes) {
            if ($p.ParentProcessId -and $procMap.ContainsKey($p.ParentProcessId)) {
                if (-not $children.ContainsKey($p.ParentProcessId)) {
                    $children[$p.ParentProcessId] = [System.Collections.Generic.List[object]]::new()
                }
                $children[$p.ParentProcessId].Add($p)
            } else {
                $roots.Add($p)
            }
        }
        function Print-Tree($proc, $indent = "") {
            $wsStr = if ($proc.WS_MB -gt 0) { " ($($proc.WS_MB) MB)" } else { "" }
            Write-Host "$indent+- $($proc.Name) [PID: $($proc.ProcessId)]$wsStr"
            if ($children.ContainsKey($proc.ProcessId)) {
                foreach ($c in ($children[$proc.ProcessId] | Sort-Object WS_MB -Descending)) {
                    Print-Tree $c ($indent + "  ")
                }
            }
        }
        $rootsWithMemory = $roots | ForEach-Object {
            function Get-TreeMemory($p) {
                $sum = $p.WS_MB
                if ($children.ContainsKey($p.ProcessId)) {
                    foreach ($c in $children[$p.ProcessId]) { $sum += Get-TreeMemory $c }
                }
                return $sum
            }
            [PSCustomObject]@{ Proc = $_; TotalMem = Get-TreeMemory $_ }
        } | Sort-Object TotalMem -Descending | Select-Object -First 8

        foreach ($r in $rootsWithMemory) {
            Print-Tree $r.Proc
            Write-Host ""
        }
      `;
      const res = await runPowerShellCapture(procScript);
      return res.stdout;
    });

    if (result) {
      console.log(result);
    }
  }
};
