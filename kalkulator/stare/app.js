const CONFIG = window.KALKULATOR_CONFIG || {}
const FIRESTORE_PROJECT = CONFIG.firestoreProjectId || 'i-janicki'
const FIREBASE_API_KEY = CONFIG.firebaseApiKey || ''
const COLLECTION = CONFIG.firestoreCollection || 'calculator_orders'
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`
const PIN_HASH = CONFIG.pinHash || ''
const PIN_SALT = CONFIG.pinSalt || ''
const PIN_LENGTH = CONFIG.pinLength || 4
const LOCK_MINUTES = CONFIG.lockMinutes || 2
const UNLOCK_HOURS = CONFIG.unlockHours || 8
const CURRENCY = CONFIG.currency || 'PLN'
const LOCAL_ORDERS_KEY = 'calc_orders_local_orders_v1'

const AUTH_KEY = 'calc_orders_auth_v1'
const FILTER_KEY = 'calc_orders_filter_v1'
const STATUS_LOCKED = new Set(['zakonczone'])
const ALL_STATUSES = ['otwarte', 'zakonczone', 'oplacone', 'wstrzymano', 'anulowano']
const STATUS_META = {
  otwarte: { label: 'Otwarte', cls: 'status-open' },
  zakonczone: { label: 'Zakończone', cls: 'status-done' },
  oplacone: { label: 'Opłacone', cls: 'status-paid' },
  wstrzymano: { label: 'Wstrzymano', cls: 'status-paused' },
  anulowano: { label: 'Anulowano', cls: 'status-cancelled' },
}

const memoryStore = globalThis.__KALKULATOR_MEMORY__ || (globalThis.__KALKULATOR_MEMORY__ = {})

const UNIT_GROUPS = [
  { label: 'Wymiary liniowe', items: ['mm', 'cm', 'dm', 'm', 'km'] },
  { label: 'Powierzchnia', items: ['mm2', 'cm2', 'dm2', 'm2', 'km2', 'a', 'ha'] },
  { label: 'Objętość', items: ['mm3', 'cm3', 'dm3', 'm3', 'ml', 'l', 'kl'] },
  { label: 'Masa', items: ['mg', 'g', 'kg', 't'] },
  { label: 'Czas', items: ['ms', 's', 'min', 'h', 'd'] },
]
const CUSTOM_UNIT_VALUE = '__custom__'
const COMMON_UNITS = new Set(UNIT_GROUPS.flatMap((group) => group.items))

const state = {
  unlocked: false,
  authUntil: 0,
  lockUntil: 0,
  attempts: 0,
  backendMode: canUseFirestore() ? 'firestore' : 'local',
  orders: [],
  selectedOrderId: '',
  filters: {
    query: '',
    sort: 'newest',
    statuses: new Set(ALL_STATUSES),
  },
  saveTimers: new Map(),
  loading: false,
}

const $ = (id) => document.getElementById(id)
const ui = {
  gateView: $('gateView'),
  dashboardView: $('dashboardView'),
  pinBox: $('pinBox'),
  pinInput: $('pinInput'),
  pinCells: Array.from(document.querySelectorAll('.pin-cell')),
  pinHint: $('pinHint'),
  lockTimer: $('lockTimer'),
  detailPane: $('detailPane'),
  ordersList: $('ordersList'),
  ordersCount: $('ordersCount'),
  filteredCount: $('filteredCount'),
  refreshBtn: $('refreshBtn'),
  createOrderForm: $('createOrderForm'),
  newOrderName: $('newOrderName'),
  addOrderFab: $('addOrderFab'),
  addOrderModal: $('addOrderModal'),
  orderModal: $('orderModal'),
  orderModalTitle: $('orderModalTitle'),
  searchFab: $('searchFab'),
  moneyFab: $('moneyFab'),
  searchModal: $('searchModal'),
  moneyModal: $('moneyModal'),
  searchInput: $('searchInput'),
  sortSelect: $('sortSelect'),
  statusFilters: $('statusFilters'),
  searchSummary: $('searchSummary'),
  searchResults: $('searchResults'),
  moneySummary: $('moneySummary'),
  toastHost: $('toastHost'),
}

let refreshTimer = null

function nowIso() {
  return new Date().toISOString()
}

function firestoreUrl(path) {
  const base = `${FIRESTORE_BASE}/${path}`
  if (!FIREBASE_API_KEY) return base
  return `${base}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(FIREBASE_API_KEY)}`
}

function firestoreDocumentUrl(documentPath) {
  return firestoreUrl(documentPath.split('/').map((part) => encodeURIComponent(part)).join('/'))
}

function canUseFirestore() {
  return Boolean(FIREBASE_API_KEY)
    && window.location.protocol !== 'file:'
    && window.location.origin !== 'null'
}

function moneyFormatter(value) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function shortDate(value) {
  if (!value) return 'brak daty'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'brak daty'
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeDecimalInput(value) {
  return String(value)
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

function parseAmount(value) {
  const normalized = normalizeDecimalInput(value)
  if (!normalized || normalized === '.') return 0
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

function formatEditableNumber(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return ''
  const text = String(numeric)
  return text.includes('.') ? text.replace('.', ',') : text
}

function itemTotal(item) {
  return round2(parseAmount(item.price) * parseAmount(item.quantity))
}

function orderTotal(order) {
  return round2((order.items || []).reduce((sum, item) => sum + itemTotal(item), 0))
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function buildSearchIndex(order) {
  const pieces = [
    order.name,
    order.status,
    String(order.total ?? ''),
    String(order.items?.length ?? 0),
    ...((order.items || []).flatMap((item) => [
      item.serviceName,
      getItemUnitText(item),
      String(item.price ?? ''),
      String(item.quantity ?? ''),
      String(item.total ?? ''),
    ])),
  ]
  return normalizeText(pieces.join(' '))
}

function getItemUnitMode(item = {}) {
  if (item.unitMode === 'custom') return 'custom'
  if (item.unitMode === 'preset') return 'preset'
  if (item.unitCustom) return 'custom'
  const unit = String(item.unit || '').trim()
  if (!unit) return 'preset'
  return COMMON_UNITS.has(unit) ? 'preset' : 'custom'
}

function getItemPresetUnit(item = {}) {
  const unit = String(item.unit || 'mm').trim()
  return COMMON_UNITS.has(unit) ? unit : 'mm'
}

function getItemCustomUnit(item = {}) {
  if (getItemUnitMode(item) !== 'custom') return ''
  return String(item.unitCustom || item.unit || '').trim()
}

function getItemUnitText(item = {}) {
  return getItemUnitMode(item) === 'custom'
    ? getItemCustomUnit(item)
    : getItemPresetUnit(item)
}

function normalizeItem(item = {}) {
  const price = parseAmount(item.price)
  const quantity = item.quantity === undefined || item.quantity === null || item.quantity === ''
    ? 1
    : parseAmount(item.quantity)
  const unitMode = getItemUnitMode(item)
  const unit = getItemPresetUnit(item)
  const unitCustom = unitMode === 'custom' ? getItemCustomUnit(item) : ''
  return {
    id: item.id || crypto.randomUUID(),
    serviceName: String(item.serviceName || '').trim(),
    unitMode,
    unit,
    unitCustom,
    price,
    quantity,
    total: round2(price * quantity),
  }
}

function normalizeOrder(order = {}) {
  const items = (order.items || []).map(normalizeItem)
  const total = round2(items.reduce((sum, item) => sum + item.total, 0))
  return {
    id: order.id || '',
    name: String(order.name || '').trim(),
    status: ALL_STATUSES.includes(order.status) ? order.status : 'otwarte',
    createdAt: order.createdAt || nowIso(),
    updatedAt: order.updatedAt || order.createdAt || nowIso(),
    items,
    total,
    searchText: buildSearchIndex({ ...order, items, total }),
  }
}

function readLocalOrders() {
  try {
    const raw = JSON.parse(safeStorageGet(LOCAL_ORDERS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.map((order) => normalizeOrder(order))
  } catch {
    return []
  }
}

function writeLocalOrders(orders) {
  try {
    safeStorageSet(LOCAL_ORDERS_KEY, JSON.stringify(orders.map((order) => normalizeOrder(order))))
  } catch (error) {
    console.error('writeLocalOrders', error)
  }
}

function safeStorageGet(key) {
  try {
    const value = localStorage.getItem(key)
    if (value !== null) return value
  } catch {}
  return memoryStore[key] ?? null
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return
  } catch {}
  memoryStore[key] = value
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  switch (typeof value) {
    case 'string':
      return { stringValue: value }
    case 'number':
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value }
    case 'boolean':
      return { booleanValue: value }
    case 'object': {
      const fields = {}
      for (const [key, nested] of Object.entries(value)) {
        fields[key] = encodeValue(nested)
      }
      return { mapValue: { fields } }
    }
    default:
      return { stringValue: String(value) }
  }
}

function decodeValue(value) {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) {
    const out = {}
    for (const [key, nested] of Object.entries(value.mapValue.fields || {})) {
      out[key] = decodeValue(nested)
    }
    return out
  }
  return null
}

function decodeOrderDocument(doc) {
  const fields = doc.fields || {}
  const raw = {}
  for (const [key, value] of Object.entries(fields)) {
    raw[key] = decodeValue(value)
  }
  return {
    ...normalizeOrder({
      id: String(raw.id || doc.name?.split('/').pop() || ''),
      name: raw.name,
      status: raw.status,
      createdAt: raw.createdAt || doc.createTime || nowIso(),
      updatedAt: raw.updatedAt || doc.updateTime || raw.createdAt || doc.createTime || nowIso(),
      items: Array.isArray(raw.items) ? raw.items : [],
    }),
  }
}

function makeOrderTemplate(name = '') {
  return normalizeOrder({
    id: crypto.randomUUID(),
    name,
    status: 'otwarte',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    items: [],
  })
}

function isLocked(order) {
  return STATUS_LOCKED.has(order.status)
}

function filteredOrders() {
  const query = normalizeText(state.filters.query)
  const selectedStatuses = state.filters.statuses.size ? state.filters.statuses : new Set(ALL_STATUSES)

  const filtered = state.orders.filter((order) => {
    if (!selectedStatuses.has(order.status)) return false
    if (!query) return true
    return order.searchText.includes(query) || normalizeText(order.total).includes(query)
  })

  return sortOrders(filtered, state.filters.sort)
}

function sortOrders(list, sortKey) {
  const copy = [...list]
  copy.sort((a, b) => {
    const byDateDesc = new Date(b.createdAt) - new Date(a.createdAt)
    const byUpdatedDesc = new Date(b.updatedAt) - new Date(a.updatedAt)
    const byNameAsc = a.name.localeCompare(b.name, 'pl')
    const byTotalDesc = b.total - a.total

    switch (sortKey) {
      case 'oldest':
        return -byDateDesc
      case 'name-asc':
        return byNameAsc || byDateDesc
      case 'name-desc':
        return -byNameAsc || byDateDesc
      case 'total-desc':
        return byTotalDesc || byDateDesc
      case 'total-asc':
        return -byTotalDesc || byDateDesc
      case 'updated-desc':
        return byUpdatedDesc || byDateDesc
      case 'newest':
      default:
        return byDateDesc
    }
  })
  return copy
}

function selectedOrder() {
  return state.orders.find((order) => order.id === state.selectedOrderId) || null
}

function setToast(message, kind = 'ok') {
  const toast = document.createElement('div')
  toast.className = `toast ${kind === 'error' ? 'is-error' : 'is-ok'}`
  toast.textContent = message
  ui.toastHost.appendChild(toast)
  window.setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(4px)'
  }, 2400)
  window.setTimeout(() => toast.remove(), 3200)
}

function saveAuthState() {
  safeStorageSet(AUTH_KEY, JSON.stringify({
    authUntil: state.authUntil,
    attempts: state.attempts,
    lockUntil: state.lockUntil,
  }))
}

function loadAuthState() {
  try {
    const raw = JSON.parse(safeStorageGet(AUTH_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      state.authUntil = Number(raw.authUntil) || 0
      state.attempts = Number(raw.attempts) || 0
      state.lockUntil = Number(raw.lockUntil) || 0
    }
  } catch {
    state.authUntil = 0
    state.attempts = 0
    state.lockUntil = 0
  }
}

function syncLockUi() {
  const now = Date.now()
  const locked = state.lockUntil > now
  ui.pinBox.classList.toggle('is-active', document.activeElement === ui.pinInput)
  if (locked) {
    const left = Math.max(0, Math.ceil((state.lockUntil - now) / 1000))
    ui.pinHint.textContent = 'Za dużo błędów. Spróbuj ponownie po chwili.'
    ui.lockTimer.textContent = `Blokada: ${left}s`
    ui.pinInput.disabled = true
  } else {
    if (state.lockUntil && state.lockUntil <= now) {
      state.lockUntil = 0
      state.attempts = 0
      saveAuthState()
    }
    ui.pinInput.disabled = false
    ui.pinHint.textContent = 'Wpisz 4 cyfry, strona otworzy się automatycznie.'
    ui.lockTimer.textContent = state.attempts ? `Nieudane próby: ${state.attempts}/5` : ''
  }
}

function renderPinCells(value) {
  const chars = String(value).slice(0, PIN_LENGTH).split('')
  ui.pinCells.forEach((cell, index) => {
    cell.textContent = chars[index] ? '•' : ''
  })
}

function focusPin() {
  if (!ui.pinInput.disabled) ui.pinInput.focus()
}

function hashPin(pin) {
  if (!PIN_SALT) return ''
  let hash = 0x811c9dc5
  const text = `${PIN_SALT}:${pin}`
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

async function verifyPin(pin) {
  const hashed = hashPin(pin)
  if (hashed && hashed === PIN_HASH) {
    state.unlocked = true
    state.authUntil = Date.now() + (UNLOCK_HOURS * 60 * 60 * 1000)
    state.attempts = 0
    state.lockUntil = 0
    saveAuthState()
    ui.pinInput.value = ''
    renderPinCells('')
    unlockApp()
    return
  }

  state.attempts += 1
  if (state.attempts >= 5) {
    state.lockUntil = Date.now() + (LOCK_MINUTES * 60 * 1000)
    state.attempts = 0
  }
  saveAuthState()
  ui.pinInput.value = ''
  renderPinCells('')
  syncLockUi()
  setToast('Nieprawidłowy PIN.', 'error')
}

function unlockApp() {
  ui.gateView.hidden = true
  ui.dashboardView.hidden = false
  renderStatusFilters()
  if (state.backendMode === 'local') {
    setToast('Tryb lokalny: Firestore jest niedostępny w tym uruchomieniu.', 'ok')
  }
  loadOrders({ silent: true }).catch((error) => {
    console.error(error)
    setToast('Nie udało się wczytać zleceń.', 'error')
  })
  if (state.backendMode === 'firestore') startRefreshTimer()
}

function maybeRestoreSession() {
  if (state.lockUntil > Date.now()) {
    syncLockUi()
    return
  }
  if (state.authUntil > Date.now()) {
    state.unlocked = true
    unlockApp()
  } else {
    syncLockUi()
  }
}

function startRefreshTimer() {
  stopRefreshTimer()
  refreshTimer = window.setInterval(() => {
    if (!state.unlocked) return
    loadOrders({ silent: true }).catch(() => {})
  }, 45000)
}

function stopRefreshTimer() {
  if (refreshTimer) window.clearInterval(refreshTimer)
  refreshTimer = null
}

async function loadOrders({ silent = false } = {}) {
  if (state.loading) return
  state.loading = true
  try {
    if (state.backendMode === 'local') {
      state.orders = sortOrders(readLocalOrders(), 'newest')
      state.selectedOrderId = state.selectedOrderId && state.orders.some((order) => order.id === state.selectedOrderId)
        ? state.selectedOrderId
        : state.orders[0]?.id || ''
      renderEverything()
      if (!silent) setToast(`Wczytano ${state.orders.length} zleceń lokalnie.`, 'ok')
      return
    }

    const res = await fetch(firestoreUrl(`${COLLECTION}?pageSize=200`))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const documents = Array.isArray(data.documents) ? data.documents : []
    state.orders = sortOrders(documents.map(decodeOrderDocument), 'newest')
    state.selectedOrderId = state.selectedOrderId && state.orders.some((order) => order.id === state.selectedOrderId)
      ? state.selectedOrderId
      : state.orders[0]?.id || ''
    renderEverything()
    if (!silent) setToast(`Wczytano ${state.orders.length} zleceń.`, 'ok')
  } catch (error) {
    console.error('loadOrders', error)
    if (!silent) setToast('Błąd pobierania danych z Firestore.', 'error')
  } finally {
    state.loading = false
  }
}

function buildOrderCard(order) {
  const status = STATUS_META[order.status] || STATUS_META.otwarte
  const previewItems = order.items.slice(0, 2).map((item) => item.serviceName).filter(Boolean)
  const preview = previewItems.length
    ? previewItems.join(' · ')
    : 'Brak pozycji'

  return `
    <button class="order-card ${order.id === state.selectedOrderId ? 'is-active' : ''}" type="button" data-action="select-order" data-id="${order.id}">
      <div class="order-card-head">
        <div class="order-card-title">${escapeHtml(order.name || 'Bez nazwy')}</div>
        <span class="status-pill ${status.cls}">${status.label}</span>
      </div>
      <div class="order-preview">${escapeHtml(preview)}</div>
      <div class="order-card-foot order-meta">
        <span>${order.items.length} poz.</span>
        <span>${moneyFormatter(order.total)}</span>
        <span>${shortDate(order.updatedAt)}</span>
      </div>
    </button>
  `
}

function renderOrderList() {
  const visible = filteredOrders()
  ui.ordersCount.textContent = `${state.orders.length} ${state.orders.length === 1 ? 'zlecenie' : 'zleceń'}`
  ui.filteredCount.textContent = visible.length === state.orders.length
    ? ''
    : `Widoczne: ${visible.length}`

  if (!visible.length) {
    ui.ordersList.innerHTML = `
      <div class="result-empty">Brak zleceń pasujących do filtrów.</div>
    `
    return
  }

  ui.ordersList.innerHTML = visible.map(buildOrderCard).join('')
}

function renderStatusChips(order) {
  const locked = isLocked(order)
  const buttons = []

  if (locked) {
    buttons.push(`<button class="status-btn is-active" type="button" data-action="set-status" data-status="otwarte">Otwórz ponownie</button>`)
  } else {
    for (const status of ALL_STATUSES) {
      const meta = STATUS_META[status]
      buttons.push(`
        <button
          class="status-btn ${order.status === status ? 'is-active' : ''} ${status === 'anulowano' ? 'is-danger' : ''}"
          type="button"
          data-action="set-status"
          data-status="${status}"
        >${meta.label}</button>
      `)
    }
  }

  return buttons.join('')
}

function renderUnitSelect(selected = 'mm') {
  return UNIT_GROUPS.map((group) => `
    <optgroup label="${group.label}">
      ${group.items.map((unit) => `<option value="${unit}" ${unit === selected ? 'selected' : ''}>${unit}</option>`).join('')}
    </optgroup>
  `).join('') + `
    <option value="${CUSTOM_UNIT_VALUE}" ${selected === CUSTOM_UNIT_VALUE ? 'selected' : ''}>Własna</option>
  `
}

function renderUnitField({ orderId = '', itemId = '', item = {}, locked = false, scope = 'row' }) {
  const unitMode = getItemUnitMode(item)
  const presetUnit = getItemPresetUnit(item)
  const customUnit = getItemCustomUnit(item)
  const selected = unitMode === 'custom' ? CUSTOM_UNIT_VALUE : presetUnit
  const stackClass = scope === 'builder' ? 'unit-stack is-builder' : 'unit-stack'
  const selectId = scope === 'builder' ? 'itemUnit' : ''
  const customId = scope === 'builder' ? 'itemUnitCustom' : ''

  return `
    <div class="${stackClass}">
      <select
        ${selectId ? `id="${selectId}"` : ''}
        data-field="unit"
        data-order-id="${orderId}"
        data-item-id="${itemId}"
        ${locked ? 'disabled' : ''}
      >
        ${renderUnitSelect(selected)}
      </select>
      <input
        ${customId ? `id="${customId}"` : ''}
        type="text"
        data-field="unit-custom"
        data-order-id="${orderId}"
        data-item-id="${itemId}"
        value="${escapeHtml(customUnit)}"
        placeholder="Własna jednostka"
        ${unitMode === 'custom' ? '' : 'hidden'}
        ${locked ? 'disabled' : ''}
      />
    </div>
  `
}

function renderItemRow(orderId, item, index, locked) {
  return `
    <article class="item-card ${locked ? 'is-locked' : ''}" data-item-id="${item.id}" data-order-id="${orderId}">
      <div class="item-card-top">
        <div>
          <p class="item-card-kicker">Pozycja ${String(index + 1).padStart(2, '0')}</p>
          <strong class="item-card-title">${escapeHtml(item.serviceName || 'Nowa pozycja')}</strong>
        </div>
        <div class="item-total-card">
          <span>Razem</span>
          <strong data-item-total="${item.id}">${moneyFormatter(item.total)}</strong>
        </div>
      </div>

      <div class="item-card-grid">
      <label class="field field-compact">
        <span>Nazwa usługi</span>
        <input
          type="text"
          data-field="serviceName"
          data-order-id="${orderId}"
          data-item-id="${item.id}"
          value="${escapeHtml(item.serviceName)}"
          placeholder="Nazwa usługi"
          ${locked ? 'disabled' : ''}
        />
      </label>
      <label class="field field-compact unit-field">
        <span>Jednostka miary</span>
        ${renderUnitField({ orderId, itemId: item.id, item, locked })}
      </label>
      <label class="field field-compact">
        <span>Cena jednostkowa</span>
        <input
          type="text"
          inputmode="decimal"
          data-field="price"
          data-order-id="${orderId}"
          data-item-id="${item.id}"
          value="${escapeHtml(formatEditableNumber(item.price))}"
          placeholder="Cena"
          ${locked ? 'disabled' : ''}
        />
      </label>
      <label class="field field-compact">
        <span>Ilość jednostek</span>
        <input
          type="text"
          inputmode="decimal"
          data-field="quantity"
          data-order-id="${orderId}"
          data-item-id="${item.id}"
          value="${escapeHtml(formatEditableNumber(item.quantity))}"
          placeholder="Ilość"
          ${locked ? 'disabled' : ''}
        />
      </label>
      </div>

      <div class="item-card-actions">
        <button class="secondary-btn" type="button" data-action="duplicate-item" data-order-id="${orderId}" data-item-id="${item.id}" ${locked ? 'disabled' : ''}>Powiel</button>
        <button class="danger-btn" type="button" data-action="delete-item" data-order-id="${orderId}" data-item-id="${item.id}" ${locked ? 'disabled' : ''}>Usuń</button>
      </div>
    </article>
  `
}

function renderDetailPane() {
  const order = selectedOrder()
  if (!order) {
    if (ui.orderModalTitle) ui.orderModalTitle.textContent = 'Podgląd i edycja'
    ui.detailPane.innerHTML = `
      <div class="empty-state">
        <p class="panel-kicker">Brak aktywnego zlecenia</p>
        <p class="empty-title">Wybierz kafel z listy albo dodaj nowe zlecenie.</p>
        <p>Po otwarciu pokaże się panel z czytelnymi sekcjami, statusami i pozycjami.</p>
      </div>
    `
    return
  }

  const locked = isLocked(order)
  const status = STATUS_META[order.status] || STATUS_META.otwarte
  if (ui.orderModalTitle) ui.orderModalTitle.textContent = order.name || 'Bez nazwy'
  const itemsHtml = order.items.length
    ? order.items.map((item, index) => renderItemRow(order.id, item, index, locked)).join('')
    : `<div class="empty-inline">Brak pozycji. Dodaj pierwszą pozycję w sekcji poniżej.</div>`

  ui.detailPane.innerHTML = `
    <div class="detail-shell" data-order-id="${order.id}">
      <section class="detail-hero">
        <div class="detail-hero-main panel-surface">
          <p class="panel-kicker">Zlecenie</p>
          <label class="field order-name-stack">
            <span>Nazwa zlecenia</span>
            <input
              id="orderNameInput"
              type="text"
              data-field="order-name"
              data-order-id="${order.id}"
              value="${escapeHtml(order.name)}"
              placeholder="Nazwa zlecenia"
              ${locked ? 'disabled' : ''}
            />
          </label>
          <div class="detail-meta detail-meta-rich">
            <span>Status: <strong id="orderStatusLabel">${status.label}</strong></span>
            <span>Pozycji: <strong id="orderItemCount">${order.items.length}</strong></span>
            <span>Razem: <strong id="orderTotalValue">${moneyFormatter(order.total)}</strong></span>
            <span>Aktualizacja: <strong id="orderUpdatedAt">${shortDate(order.updatedAt)}</strong></span>
          </div>
        </div>

        <aside class="detail-actions-card panel-surface panel-surface-soft">
          <div class="detail-actions-head">
            <p class="panel-kicker">Status i akcje</p>
            <p class="helper">${locked ? 'Zlecenie jest zamknięte. Otwórz je ponownie, aby wrócić do edycji.' : 'Zmiany zapisują się automatycznie.'}</p>
          </div>
          <div class="status-grid">${renderStatusChips(order)}</div>
          <div class="detail-tools">
            <button class="secondary-btn danger-btn detail-delete-btn" type="button" data-action="delete-order" data-id="${order.id}">Usuń zlecenie</button>
          </div>
        </aside>
      </section>

      <section class="summary-strip">
        <div class="summary-card summary-card-strong">
          <span>Łączna suma</span>
          <strong id="summaryTotal">${moneyFormatter(order.total)}</strong>
        </div>
        <div class="summary-card">
          <span>Pozycje</span>
          <strong id="summaryCount">${order.items.length}</strong>
        </div>
        <div class="summary-card">
          <span>Status</span>
          <strong id="summaryStatus">${status.label}</strong>
        </div>
        <div class="summary-card">
          <span>Ostatnia zmiana</span>
          <strong>${shortDate(order.updatedAt)}</strong>
        </div>
      </section>

      <section class="detail-section panel-surface">
        <div class="section-head">
          <div>
            <p class="panel-kicker">Pozycje</p>
            <h3>Lista pozycji</h3>
          </div>
          <div class="section-note">${order.items.length ? 'Każda pozycja ma własne pola i szybką sumę.' : 'Lista jest pusta.'}</div>
        </div>
        <div class="items-stack">${itemsHtml}</div>
      </section>

      <form class="item-builder panel-surface panel-surface-accent" id="addItemForm" ${locked ? 'hidden' : ''}>
        <div class="section-head">
          <div>
            <p class="panel-kicker">Dodaj pozycję</p>
            <h3>Nowa pozycja do zlecenia</h3>
          </div>
          <div class="builder-total builder-total-top">Razem pozycji: <strong id="itemPreviewTotal">${moneyFormatter(0)}</strong></div>
        </div>
        <div class="builder-grid">
          <label class="field">
            <span>Nazwa usługi</span>
            <input id="itemServiceName" type="text" placeholder="Dowolny ciąg znaków" maxlength="160" required />
          </label>
          <label class="field">
            <span>Jednostka miary</span>
            ${renderUnitField({ scope: 'builder' })}
          </label>
          <label class="field">
            <span>Cena jednostkowa</span>
            <input id="itemPrice" type="text" inputmode="decimal" placeholder="0,00" required />
          </label>
          <label class="field">
            <span>Ilość jednostek</span>
            <input id="itemQuantity" type="text" inputmode="decimal" placeholder="1" value="1" />
          </label>
        </div>
        <div class="builder-footer">
          <button class="add-item-btn primary-btn" type="submit">Dodaj pozycję</button>
        </div>
      </form>

      ${locked ? '<div class="config-error">Zlecenie jest zamknięte. Otwórz je ponownie, aby edytować pozycje.</div>' : ''}
    </div>
  `

  bindDetailFormBehavior(order)
}

function bindDetailFormBehavior(order) {
  const service = $('itemServiceName')
  const unit = $('itemUnit')
  const unitCustom = $('itemUnitCustom')
  const price = $('itemPrice')
  const quantity = $('itemQuantity')
  const preview = $('itemPreviewTotal')
  const addForm = $('addItemForm')

  const refreshPreview = () => {
    const total = round2(parseAmount(price?.value) * parseAmount(quantity?.value))
    if (preview) preview.textContent = moneyFormatter(total)
  }

  service?.addEventListener('input', refreshPreview)
  unit?.addEventListener('change', () => {
    const isCustom = unit.value === CUSTOM_UNIT_VALUE
    if (unitCustom) {
      unitCustom.hidden = !isCustom
      if (isCustom) window.setTimeout(() => unitCustom.focus(), 0)
    }
    refreshPreview()
  })
  unitCustom?.addEventListener('input', refreshPreview)
  price?.addEventListener('input', (event) => {
    event.target.value = normalizeDecimalInput(event.target.value).replace('.', ',')
    refreshPreview()
  })
  quantity?.addEventListener('input', (event) => {
    event.target.value = normalizeDecimalInput(event.target.value).replace('.', ',')
    refreshPreview()
  })

  refreshPreview()

  addForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!order || isLocked(order)) return

    const serviceName = service.value.trim()
    if (!serviceName) {
      setToast('Podaj nazwę usługi.', 'error')
      service.focus()
      return
    }

    const selectedUnit = unit.value
    const customUnit = unitCustom?.value.trim() || ''
    if (selectedUnit === CUSTOM_UNIT_VALUE && !customUnit) {
      setToast('Wpisz własną jednostkę.', 'error')
      unitCustom?.focus()
      return
    }

    const item = normalizeItem({
      serviceName,
      unitMode: selectedUnit === CUSTOM_UNIT_VALUE ? 'custom' : 'preset',
      unit: selectedUnit === CUSTOM_UNIT_VALUE ? 'mm' : selectedUnit,
      unitCustom: selectedUnit === CUSTOM_UNIT_VALUE ? customUnit : '',
      price: price.value,
      quantity: quantity.value || '1',
    })

    order.items.push(item)
    order.updatedAt = nowIso()
    order.total = orderTotal(order)
    order.searchText = buildSearchIndex(order)
    await persistOrder(order)
    renderEverything()
    setToast('Pozycja dodana do zlecenia.', 'ok')
  })
}

function refreshDetailSummary(order) {
  const current = order || selectedOrder()
  if (!current) return
  const total = moneyFormatter(current.total)
  const status = STATUS_META[current.status] || STATUS_META.otwarte
  const statusLabel = status.label
  const count = String(current.items.length)

  const totalEl = $('orderTotalValue')
  const summaryTotal = $('summaryTotal')
  const summaryCount = $('summaryCount')
  const summaryStatus = $('summaryStatus')
  const statusLabelEl = $('orderStatusLabel')
  const itemCountEl = $('orderItemCount')
  const updatedAtEl = $('orderUpdatedAt')

  if (totalEl) totalEl.textContent = total
  if (summaryTotal) summaryTotal.textContent = total
  if (summaryCount) summaryCount.textContent = count
  if (summaryStatus) summaryStatus.textContent = statusLabel
  if (statusLabelEl) statusLabelEl.textContent = statusLabel
  if (itemCountEl) itemCountEl.textContent = count
  if (updatedAtEl) updatedAtEl.textContent = shortDate(current.updatedAt)

  const detailPaneOrder = ui.detailPane.querySelector(`[data-order-id="${current.id}"]`)
  if (detailPaneOrder) {
    detailPaneOrder.querySelectorAll('[data-item-id]').forEach((row) => {
      const itemId = row.dataset.itemId
      const item = current.items.find((entry) => entry.id === itemId)
      const totalCell = row.querySelector(`[data-item-total="${itemId}"]`)
      if (item && totalCell) totalCell.textContent = moneyFormatter(item.total)
    })
  }
}

function refreshOrderCard(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId)
  if (!order) return
  const card = ui.ordersList.querySelector(`[data-id="${orderId}"]`)
  if (!card) return
  const title = card.querySelector('.order-card-title')
  const statusPill = card.querySelector('.status-pill')
  const preview = card.querySelector('.order-preview')
  const meta = card.querySelector('.order-card-foot')
  if (title) title.textContent = order.name || 'Bez nazwy'
  if (statusPill) {
    const status = STATUS_META[order.status] || STATUS_META.otwarte
    statusPill.className = `status-pill ${status.cls}`
    statusPill.textContent = status.label
  }
  if (preview) {
    const items = order.items.slice(0, 2).map((item) => item.serviceName).filter(Boolean)
    preview.textContent = items.length ? items.join(' · ') : 'Brak pozycji'
  }
  if (meta) {
    meta.innerHTML = `
      <span>${order.items.length} poz.</span>
      <span>${moneyFormatter(order.total)}</span>
      <span>${shortDate(order.updatedAt)}</span>
    `
  }
}

function renderSearchModal() {
  const query = normalizeText(state.filters.query)
  const visible = filteredOrders()
  const totalCount = state.orders.length
  const matchText = query ? `Szukasz: "${state.filters.query}"` : 'Bez frazy'
  ui.searchSummary.textContent = `${visible.length} wyników z ${totalCount}. ${matchText}.`
  ui.searchResults.innerHTML = visible.length
    ? visible.slice(0, 12).map((order) => `
        <button class="result-card" type="button" data-action="select-order" data-id="${order.id}">
          <div class="row">
            <strong>${escapeHtml(order.name || 'Bez nazwy')}</strong>
            <span class="status-pill ${STATUS_META[order.status]?.cls || STATUS_META.otwarte.cls}">${STATUS_META[order.status]?.label || 'Otwarte'}</span>
          </div>
          <div class="row search-result-meta">
            <span>${order.items.length} poz.</span>
            <span>${moneyFormatter(order.total)}</span>
            <span>${shortDate(order.updatedAt)}</span>
          </div>
          <div class="subtle">${escapeHtml(order.items.map((item) => item.serviceName).filter(Boolean).slice(0, 3).join(' · ') || 'Brak pozycji')}</div>
        </button>
      `).join('')
    : `<div class="result-empty">Brak pasujących zleceń.</div>`

  renderStatusFilters()
}

function renderStatusFilters() {
  ui.statusFilters.innerHTML = ALL_STATUSES.map((status) => {
    const active = state.filters.statuses.has(status)
    const meta = STATUS_META[status]
    return `
      <button class="order-chip ${active ? 'is-active' : ''}" type="button" data-action="toggle-status-filter" data-status="${status}">
        ${meta.label}
      </button>
    `
  }).join('')
}

function renderMoneyModal() {
  const totals = state.orders.reduce((acc, order) => {
    if (order.status === 'oplacone') {
      acc.paid += order.total
    } else if (order.status === 'zakonczone') {
      acc.unpaid += order.total
    }
    if (order.status === 'oplacone' || order.status === 'zakonczone') {
      acc.total += order.total
    }
    return acc
  }, { paid: 0, unpaid: 0, total: 0 })

  ui.moneySummary.innerHTML = `
    <div class="money-card is-paid">
      <span>Opłacone</span>
      <strong>${moneyFormatter(totals.paid)}</strong>
      <div class="money-note">Status: opłacone</div>
    </div>
    <div class="money-card is-unpaid">
      <span>Nieopłacone</span>
      <strong>${moneyFormatter(totals.unpaid)}</strong>
      <div class="money-note">Status: zakończone</div>
    </div>
    <div class="money-card is-total">
      <span>Razem</span>
      <strong>${moneyFormatter(totals.total)}</strong>
      <div class="money-note">Bez wstrzymanych i anulowanych</div>
    </div>
  `
}

function setUnitCustomVisibility(selectEl, isCustom) {
  const stack = selectEl?.closest('.unit-stack')
  const customInput = stack?.querySelector('[data-field="unit-custom"]')
  if (!customInput) return
  customInput.hidden = !isCustom
  if (isCustom && !customInput.value) {
    window.setTimeout(() => customInput.focus(), 0)
  }
}

function renderEverything() {
  ensureActiveSelection()
  renderOrderList()
  renderDetailPane()
  if (!ui.searchModal.hidden) renderSearchModal()
  if (!ui.moneyModal.hidden) renderMoneyModal()
}

async function persistOrder(order, deleted = false) {
  const normalized = normalizeOrder(order)
  if (!normalized.id) return
  try {
    if (state.backendMode === 'local') {
      const orders = readLocalOrders()
      const filtered = orders.filter((entry) => entry.id !== normalized.id)
      if (!deleted) filtered.unshift(normalized)
      writeLocalOrders(filtered)
      return
    }

    const options = deleted
      ? { method: 'DELETE' }
      : {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              id: { stringValue: normalized.id },
              name: { stringValue: normalized.name || 'Bez nazwy' },
              status: { stringValue: normalized.status },
              createdAt: { timestampValue: normalized.createdAt || nowIso() },
              updatedAt: { timestampValue: normalized.updatedAt || nowIso() },
              total: { doubleValue: Number(normalized.total || 0) },
              searchText: { stringValue: normalized.searchText || '' },
              items: encodeValue(normalized.items),
            },
          }),
        }

    const res = await fetch(firestoreDocumentUrl(`${COLLECTION}/${normalized.id}`), options)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (error) {
    console.error('persistOrder', error)
    setToast('Nie udało się zapisać zmian.', 'error')
    throw error
  }
}

function queueSave(orderId) {
  if (state.saveTimers.has(orderId)) {
    clearTimeout(state.saveTimers.get(orderId))
  }
  const timer = window.setTimeout(async () => {
    const order = state.orders.find((entry) => entry.id === orderId)
    if (!order) return
    await persistOrder(order)
  }, 450)
  state.saveTimers.set(orderId, timer)
}

async function createOrder(name) {
  const order = makeOrderTemplate(name)
  await persistOrder(order)
  state.orders = sortOrders([...state.orders.filter((entry) => entry.id !== order.id), order], 'newest')
  state.selectedOrderId = order.id
  renderEverything()
  setToast('Zlecenie dodane.', 'ok')
  return order
}

async function deleteOrder(orderId) {
  if (!window.confirm('Usunąć to zlecenie?')) return
  const order = state.orders.find((entry) => entry.id === orderId)
  if (order) {
    await persistOrder({ ...order, updatedAt: nowIso() }, true)
  }
  state.orders = state.orders.filter((order) => order.id !== orderId)
  if (state.selectedOrderId === orderId) {
    state.selectedOrderId = state.orders[0]?.id || ''
  }
  renderEverything()
  setToast('Zlecenie usunięte.', 'ok')
}

function updateItemField(order, itemId, field, rawValue) {
  const item = order.items.find((entry) => entry.id === itemId)
  if (!item) return
  if (field === 'serviceName') {
    item.serviceName = rawValue
  } else if (field === 'unit') {
    if (rawValue === CUSTOM_UNIT_VALUE) {
      item.unitMode = 'custom'
      item.unitCustom = item.unitCustom || ''
    } else {
      item.unitMode = 'preset'
      item.unit = rawValue
      item.unitCustom = ''
    }
  } else if (field === 'price') {
    item.price = parseAmount(rawValue)
  } else if (field === 'quantity') {
    item.quantity = parseAmount(rawValue)
  } else if (field === 'unit-custom') {
    item.unitMode = 'custom'
    item.unitCustom = rawValue
  }
  item.total = itemTotal(item)
  order.total = orderTotal(order)
  order.updatedAt = nowIso()
  order.searchText = buildSearchIndex(order)
}

function updateOrderField(order, field, value) {
  if (field === 'order-name') {
    order.name = value.trim()
  }
  order.updatedAt = nowIso()
  order.searchText = buildSearchIndex(order)
}

async function setOrderStatus(order, status) {
  order.status = status
  order.updatedAt = nowIso()
  order.searchText = buildSearchIndex(order)
  await persistOrder(order)
  renderEverything()
  setToast(`Status ustawiony na: ${STATUS_META[status].label}.`, 'ok')
}

async function duplicateItem(order, itemId) {
  const item = order.items.find((entry) => entry.id === itemId)
  if (!item) return
  order.items.push(normalizeItem({
    serviceName: item.serviceName,
    unitMode: item.unitMode,
    unit: item.unit,
    unitCustom: item.unitCustom,
    price: item.price,
    quantity: item.quantity,
  }))
  order.total = orderTotal(order)
  order.updatedAt = nowIso()
  order.searchText = buildSearchIndex(order)
  await persistOrder(order)
  renderEverything()
  setToast('Pozycja skopiowana.', 'ok')
}

async function removeItem(order, itemId) {
  order.items = order.items.filter((entry) => entry.id !== itemId)
  order.total = orderTotal(order)
  order.updatedAt = nowIso()
  order.searchText = buildSearchIndex(order)
  await persistOrder(order)
  renderEverything()
  setToast('Pozycja usunięta.', 'ok')
}

function ensureActiveSelection() {
  if (!state.selectedOrderId) {
    state.selectedOrderId = state.orders[0]?.id || ''
    return
  }
  if (state.orders.some((order) => order.id === state.selectedOrderId)) return
  state.selectedOrderId = state.orders[0]?.id || ''
}

function applyFilterState(partial) {
  state.filters = {
    ...state.filters,
    ...partial,
  }
  safeStorageSet(FILTER_KEY, JSON.stringify({
    query: state.filters.query,
    sort: state.filters.sort,
    statuses: Array.from(state.filters.statuses),
  }))
  renderEverything()
}

function loadFilterState() {
  try {
    const raw = JSON.parse(safeStorageGet(FILTER_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      state.filters.query = String(raw.query || '')
      state.filters.sort = raw.sort || 'newest'
      state.filters.statuses = new Set(Array.isArray(raw.statuses) && raw.statuses.length ? raw.statuses : ALL_STATUSES)
    }
  } catch {
    state.filters.query = ''
    state.filters.sort = 'newest'
    state.filters.statuses = new Set(ALL_STATUSES)
  }
}

function openModal(modal) {
  const element = modal === 'search'
    ? ui.searchModal
    : modal === 'money'
      ? ui.moneyModal
      : modal === 'add-order'
        ? ui.addOrderModal
        : ui.orderModal
  element.hidden = false
  element.setAttribute('aria-hidden', 'false')
  if (modal === 'search') {
    renderSearchModal()
    ui.searchInput.value = state.filters.query
    ui.sortSelect.value = state.filters.sort
    window.setTimeout(() => ui.searchInput.focus(), 0)
  }
  if (modal === 'money') {
    renderMoneyModal()
  }
  if (modal === 'order') {
    renderDetailPane()
  }
  if (modal === 'add-order') {
    window.setTimeout(() => ui.newOrderName.focus(), 0)
  }
}

function closeModal(modal) {
  const element = modal === 'search'
    ? ui.searchModal
    : modal === 'money'
      ? ui.moneyModal
      : modal === 'add-order'
        ? ui.addOrderModal
        : ui.orderModal
  element.hidden = true
  element.setAttribute('aria-hidden', 'true')
}

function handleGlobalClick(event) {
  const target = event.target.closest('[data-action], [data-close]')
  if (!target) return

  if (target.dataset.close === 'search') {
    closeModal('search')
    return
  }
  if (target.dataset.close === 'money') {
    closeModal('money')
    return
  }
  if (target.dataset.close === 'add-order') {
    closeModal('add-order')
    return
  }
  if (target.dataset.close === 'order') {
    closeModal('order')
    return
  }

  const action = target.dataset.action
  const orderId = target.dataset.id || target.dataset.orderId
  const itemId = target.dataset.itemId
  const order = state.orders.find((entry) => entry.id === orderId) || selectedOrder()

  switch (action) {
    case 'select-order':
      state.selectedOrderId = orderId
      renderEverything()
      closeModal('search')
      openModal('order')
      break
    case 'set-status':
      if (order) setOrderStatus(order, target.dataset.status)
      break
    case 'delete-order':
      if (order) deleteOrder(order.id).catch((error) => {
        console.error(error)
        setToast('Nie udało się usunąć zlecenia.', 'error')
      })
      break
    case 'delete-item':
      if (order && !isLocked(order)) removeItem(order, itemId).catch((error) => {
        console.error(error)
        setToast('Nie udało się usunąć pozycji.', 'error')
      })
      break
    case 'duplicate-item':
      if (order && !isLocked(order)) duplicateItem(order, itemId).catch((error) => {
        console.error(error)
        setToast('Nie udało się skopiować pozycji.', 'error')
      })
      break
    case 'toggle-status-filter': {
      const statuses = new Set(state.filters.statuses)
      if (statuses.has(target.dataset.status)) {
        statuses.delete(target.dataset.status)
      } else {
        statuses.add(target.dataset.status)
      }
      if (!statuses.size) {
        statuses.clear()
        ALL_STATUSES.forEach((status) => statuses.add(status))
      }
      applyFilterState({ statuses })
      break
    }
  }
}

function handleGlobalInput(event) {
  const target = event.target
  if (target === ui.pinInput) {
    const digits = target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)
    target.value = digits
    renderPinCells(digits)
    if (digits.length === PIN_LENGTH && !ui.pinInput.disabled) {
      verifyPin(digits).catch((error) => {
        console.error(error)
        setToast('Nie udało się sprawdzić PIN-u.', 'error')
      })
    }
    return
  }

  if (target.id === 'searchInput') {
    applyFilterState({ query: target.value })
    return
  }

  if (target.id === 'newOrderName') return
  if (target.matches?.('#createOrderForm input')) return
  if (target.matches?.('[data-field="order-name"]')) {
    const order = state.orders.find((entry) => entry.id === target.dataset.orderId)
    if (!order) return
    updateOrderField(order, 'order-name', target.value)
    refreshDetailSummary(order)
    refreshOrderCard(order.id)
    queueSave(order.id)
    return
  }

  if (target.matches?.('[data-field="serviceName"], [data-field="price"], [data-field="quantity"], [data-field="unit-custom"]')) {
    const order = state.orders.find((entry) => entry.id === target.dataset.orderId)
    if (!order) return
    if (isLocked(order)) return
    const field = target.dataset.field
    if (field === 'price' || field === 'quantity') {
      target.value = normalizeDecimalInput(target.value).replace('.', ',')
    }
    updateItemField(order, target.dataset.itemId, field, target.value)
    const item = order.items.find((entry) => entry.id === target.dataset.itemId)
    const cell = ui.detailPane.querySelector(`[data-item-total="${target.dataset.itemId}"]`)
    if (item && cell) cell.textContent = moneyFormatter(item.total)
    refreshDetailSummary(order)
    refreshOrderCard(order.id)
    queueSave(order.id)
  }
}

function handleGlobalChange(event) {
  const target = event.target
  if (target.id === 'sortSelect') {
    applyFilterState({ sort: target.value })
    return
  }
  if (target.matches?.('[data-field="unit"]')) {
    const order = state.orders.find((entry) => entry.id === target.dataset.orderId)
    if (!order || isLocked(order)) return
    updateItemField(order, target.dataset.itemId, 'unit', target.value)
    setUnitCustomVisibility(target, target.value === CUSTOM_UNIT_VALUE)
    refreshDetailSummary(order)
    refreshOrderCard(order.id)
    queueSave(order.id)
  }
}

function handleSubmit(event) {
  const form = event.target
  if (form.id === 'createOrderForm') {
    event.preventDefault()
    const name = ui.newOrderName.value.trim()
    if (!name) {
      setToast('Podaj nazwę zlecenia.', 'error')
      ui.newOrderName.focus()
      return
    }
    createOrder(name).then((order) => {
      ui.newOrderName.value = ''
      closeModal('add-order')
      state.selectedOrderId = order?.id || state.selectedOrderId
      openModal('order')
    }).catch((error) => {
      console.error(error)
      setToast('Nie udało się dodać zlecenia.', 'error')
    })
  }
}

function registerUiEvents() {
  document.addEventListener('click', handleGlobalClick)
  document.addEventListener('input', handleGlobalInput)
  document.addEventListener('change', handleGlobalChange)
  document.addEventListener('submit', handleSubmit)

  ui.searchFab.addEventListener('click', () => openModal('search'))
  ui.moneyFab.addEventListener('click', () => openModal('money'))
  ui.addOrderFab.addEventListener('click', () => openModal('add-order'))
  ui.refreshBtn.addEventListener('click', () => loadOrders().catch(() => {}))

  ui.searchModal.addEventListener('click', (event) => {
    if (event.target === ui.searchModal.querySelector('.modal-backdrop')) closeModal('search')
  })
  ui.moneyModal.addEventListener('click', (event) => {
    if (event.target === ui.moneyModal.querySelector('.modal-backdrop')) closeModal('money')
  })
  ui.addOrderModal.addEventListener('click', (event) => {
    if (event.target === ui.addOrderModal.querySelector('.modal-backdrop')) closeModal('add-order')
  })
  ui.orderModal.addEventListener('click', (event) => {
    if (event.target === ui.orderModal.querySelector('.modal-backdrop')) closeModal('order')
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!ui.searchModal.hidden) closeModal('search')
      if (!ui.moneyModal.hidden) closeModal('money')
      if (!ui.addOrderModal.hidden) closeModal('add-order')
      if (!ui.orderModal.hidden) closeModal('order')
    }
  })

  ui.pinInput.addEventListener('focus', syncLockUi)
  ui.pinInput.addEventListener('blur', syncLockUi)
  ui.pinInput.addEventListener('input', handleGlobalInput)
  ui.pinInput.addEventListener('keyup', handleGlobalInput)
  ui.pinInput.addEventListener('change', handleGlobalInput)
}

function initSearchModalState() {
  ui.searchInput.value = state.filters.query
  ui.sortSelect.value = state.filters.sort
  renderStatusFilters()
}

function boot() {
  if (!PIN_HASH || !PIN_SALT) {
    ui.pinHint.textContent = 'Brak konfiguracji PIN. Uzupełnij .env i uruchom build:kalkulator.'
    ui.pinInput.disabled = true
    ui.lockTimer.textContent = ''
    ui.gateView.classList.add('config-error-visible')
    ui.dashboardView.hidden = true
    ui.gateView.hidden = false
    return
  }

  loadAuthState()
  loadFilterState()
  registerUiEvents()
  ensureActiveSelection()
  initSearchModalState()
  renderPinCells('')
  syncLockUi()

  if (state.lockUntil > Date.now()) {
    ui.pinInput.disabled = true
  }

  if (state.authUntil > Date.now() && state.lockUntil <= Date.now()) {
    state.unlocked = true
    unlockApp()
  } else {
    ui.gateView.hidden = false
    ui.dashboardView.hidden = true
    focusPin()
  }

  window.setInterval(syncLockUi, 1000)
  window.addEventListener('focus', syncLockUi)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.unlocked) {
      loadOrders({ silent: true }).catch(() => {})
    }
  })

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      closeModal(button.dataset.close)
    })
  })
}

document.addEventListener('DOMContentLoaded', boot)
