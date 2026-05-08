const NORMALIZATION_REPLACER = /[^A-Za-z0-9]+/g

function normalizeSegment(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(NORMALIZATION_REPLACER, '_')
    .replace(/^_+|_+$/g, '')
}

export function buildDeviceId(companyName: string, deviceAlias: string) {
  const company = normalizeSegment(companyName)
  const alias = normalizeSegment(deviceAlias)
  if (!company || !alias) return ''
  return `${company}_${alias}`
}
