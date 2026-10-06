import type { MetricThreshold, MetricThresholds } from './contracts'

export type MetricThresholdKey = keyof MetricThresholds

export interface MetricThresholdLimit {
  min: number
  max?: number
}

export const METRIC_THRESHOLD_LIMITS: Record<MetricThresholdKey, MetricThresholdLimit> = {
  cpuUsage: { min: 0, max: 100 },
  gpuUsage: { min: 0, max: 100 },
  ramUsage: { min: 0, max: 100 },
  diskUsage: { min: 0, max: 100 },
  cpuTemp: { min: 0, max: 120 },
  gpuTemp: { min: 0, max: 120 }
}

export function isMetricThresholdValid(metric: MetricThresholdKey, threshold: MetricThreshold) {
  const { min, max } = METRIC_THRESHOLD_LIMITS[metric]
  const values = [threshold.warning, threshold.critical]

  return values.every((value) => Number.isFinite(value) && value >= min && (max === undefined || value <= max))
    && threshold.warning < threshold.critical
}
