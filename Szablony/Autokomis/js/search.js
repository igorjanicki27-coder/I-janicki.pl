const inventory = Array.isArray(window.inventory) ? window.inventory : [];

const brandSelect = document.getElementById('brand');
const fuelSelect = document.getElementById('fuel');
const gearboxSelect = document.getElementById('gearbox');
const yearMinInput = document.getElementById('year-min');
const priceMaxInput = document.getElementById('price-max');
const queryInput = document.getElementById('query');
const sortSelect = document.getElementById('sort');
const clearBtn = document.getElementById('clear-filters');
const resultsGrid = document.getElementById('results-grid');
const resultCount = document.getElementById('result-count');

function formatPrice(value) {
  return `${new Intl.NumberFormat('pl-PL').format(value)} zł`;
}

function formatMileage(value) {
  return `${new Intl.NumberFormat('pl-PL').format(value)} km`;
}

function renderCards(data) {
  if (!resultsGrid) return;

  if (!data.length) {
    resultsGrid.innerHTML = '<p class="empty-state">Brak ofert dla wybranych filtrów. Spróbuj poszerzyć kryteria.</p>';
    return;
  }

  resultsGrid.innerHTML = data
    .map(
      (car) => `
      <article class="market-card">
        <img src="${car.image}" alt="${car.title}" loading="lazy" />
        <div class="market-body">
          <h3>${car.title}</h3>
          <ul>
            <li>${car.year}</li>
            <li>${formatMileage(car.mileage)}</li>
            <li>${car.fuel}</li>
            <li>${car.gearbox}</li>
          </ul>
          <div class="market-foot">
            <strong>${formatPrice(car.price)}</strong>
            <a href="./index.html#kontakt">Zapytaj o ofertę</a>
          </div>
        </div>
      </article>
    `
    )
    .join('');
}

function applyFilters() {
  const brand = brandSelect?.value || '';
  const fuel = fuelSelect?.value || '';
  const gearbox = gearboxSelect?.value || '';
  const yearMin = Number(yearMinInput?.value || 0);
  const priceMax = Number(priceMaxInput?.value || 0);
  const query = (queryInput?.value || '').trim().toLowerCase();
  const sort = sortSelect?.value || 'newest';

  let filtered = inventory.filter((car) => {
    if (brand && car.brand !== brand) return false;
    if (fuel && car.fuel !== fuel) return false;
    if (gearbox && car.gearbox !== gearbox) return false;
    if (yearMin && car.year < yearMin) return false;
    if (priceMax && car.price > priceMax) return false;
    if (query && !car.title.toLowerCase().includes(query)) return false;
    return true;
  });

  if (sort === 'price-asc') filtered = filtered.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') filtered = filtered.sort((a, b) => b.price - a.price);
  if (sort === 'mileage-asc') filtered = filtered.sort((a, b) => a.mileage - b.mileage);
  if (sort === 'newest') filtered = filtered.sort((a, b) => b.year - a.year);

  if (resultCount) {
    resultCount.textContent = `Znaleziono ${filtered.length} ${filtered.length === 1 ? 'ofertę' : 'ofert'}`;
  }

  renderCards(filtered);
}

function hydrateBrands() {
  if (!brandSelect) return;
  const brands = [...new Set(inventory.map((item) => item.brand))].sort();
  brands.forEach((brand) => {
    const option = document.createElement('option');
    option.value = brand;
    option.textContent = brand;
    brandSelect.appendChild(option);
  });
}

function readQueryPreset() {
  const params = new URLSearchParams(window.location.search);
  const presetBrand = params.get('brand');
  if (presetBrand && brandSelect) {
    brandSelect.value = presetBrand;
  }
}

[brandSelect, fuelSelect, gearboxSelect, yearMinInput, priceMaxInput, queryInput, sortSelect].forEach((node) => {
  node?.addEventListener('input', applyFilters);
});

clearBtn?.addEventListener('click', () => {
  if (brandSelect) brandSelect.value = '';
  if (fuelSelect) fuelSelect.value = '';
  if (gearboxSelect) gearboxSelect.value = '';
  if (yearMinInput) yearMinInput.value = '';
  if (priceMaxInput) priceMaxInput.value = '';
  if (queryInput) queryInput.value = '';
  if (sortSelect) sortSelect.value = 'newest';
  applyFilters();
});

hydrateBrands();
readQueryPreset();
applyFilters();
