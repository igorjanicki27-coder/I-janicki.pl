export const MIN_ZOOM = 25;
export const MAX_ZOOM = 300;
export const ZOOM_STEP = 10;

export function clampZoom(value) {
  return Number.isFinite(value) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value))) : 100;
}

export function fitZoom(availableWidth, tableWidths) {
  const widest = Math.max(0, ...tableWidths.filter(width => Number.isFinite(width) && width > 0));
  if (!widest || !Number.isFinite(availableWidth) || availableWidth <= 0) return 100;
  return clampZoom(Math.floor(availableWidth / widest * 100));
}

function zoomSetting(value) {
  if (value?.mode !== 'manual' && value?.mode !== 'fit') return null;
  return {mode: value.mode, percent: clampZoom(value.percent)};
}

export function readZoomPreferences(raw) {
  const preferences = {version: 2, tabs: {}};
  try {
    const saved = JSON.parse(raw);
    if (saved?.version === 2 && saved.tabs && typeof saved.tabs === 'object' && !Array.isArray(saved.tabs)) {
      preferences.tabs = Object.fromEntries(Object.entries(saved.tabs).flatMap(([id, value]) => {
        const setting = zoomSetting(value);
        return setting ? [[id, setting]] : [];
      }));
    } else {
      const legacy = zoomSetting(saved);
      if (legacy) preferences.legacy = legacy;
    }
  } catch {}
  return preferences;
}

export function tabZoom(preferences, tabId) {
  return Object.hasOwn(preferences.tabs, tabId) ? {...preferences.tabs[tabId]} : {mode: 'fit', percent: 100};
}

export function rememberTabZoom(preferences, tabId, mode, percent) {
  return {version: 2, tabs: {...preferences.tabs, [tabId]: zoomSetting({mode, percent}) || {mode: 'fit', percent: 100}}};
}
