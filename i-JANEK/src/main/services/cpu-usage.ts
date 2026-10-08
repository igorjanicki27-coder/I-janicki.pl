// WMI raw counters and PERF_100NSEC_TIMER_INV, as documented by Microsoft.
// Class/property names are independent of the Windows display language.
export const WINDOWS_CPU_SAMPLE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$query = @{ ClassName = 'Win32_PerfRawData_PerfOS_Processor'; Filter = "Name='_Total'" }
$first = Get-CimInstance @query
Start-Sleep -Milliseconds 1000
$second = Get-CimInstance @query
if ($null -eq $first -or $null -eq $second) { throw 'CPU counters unavailable' }
if ($null -eq $first.Timestamp_Sys100NS -or $null -eq $second.Timestamp_Sys100NS -or
    $null -eq $first.PercentProcessorTime -or $null -eq $second.PercentProcessorTime) {
  throw 'CPU counter values unavailable'
}
# Subtract as decimals before dividing to preserve the precision of UInt64 counters.
$elapsed = [decimal]$second.Timestamp_Sys100NS - [decimal]$first.Timestamp_Sys100NS
$idle = [decimal]$second.PercentProcessorTime - [decimal]$first.PercentProcessorTime
if ($elapsed -le 0 -or $idle -lt 0 -or $idle -gt $elapsed) { throw 'Invalid CPU counter interval' }
((1 - ($idle / $elapsed)) * 100) | ConvertTo-Json -Compress
`

function normalizeCpuUsage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null
  return Number(value.toFixed(1))
}

interface CpuUsageSources {
  platform: string
  windowsSample: () => Promise<string>
  currentLoad: () => Promise<{ currentLoad: number }>
  wait: (milliseconds: number) => Promise<void>
}

export async function collectCpuUsage(sources: CpuUsageSources): Promise<number> {
  if (sources.platform === 'win32') {
    try {
      const usage = normalizeCpuUsage(JSON.parse(await sources.windowsSample()))
      if (usage !== null) return usage
    } catch {
      // Machines with unavailable WMI counters still get a fresh fallback sample.
    }
  }

  // currentLoad() retains its baseline between calls. Reset the interval so an
  // hourly telemetry cycle measures the current load rather than the whole hour.
  await sources.currentLoad()
  await sources.wait(1000)
  const usage = normalizeCpuUsage((await sources.currentLoad()).currentLoad)
  if (usage === null) throw new Error('Nie udało się odczytać użycia procesora.')
  return usage
}
