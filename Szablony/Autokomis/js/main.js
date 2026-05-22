const featuredGrid = document.getElementById('featured-grid');

function formatPrice(value) {
  return `${new Intl.NumberFormat('pl-PL').format(value)} zł`;
}

function offerCardTemplate(car) {
  return `
    <article class="market-card">
      <img src="${car.image}" alt="${car.title}" loading="lazy" />
      <div class="market-body">
        <h3>${car.title}</h3>
        <ul>
          <li>${car.year}</li>
          <li>${new Intl.NumberFormat('pl-PL').format(car.mileage)} km</li>
          <li>${car.fuel}</li>
          <li>${car.gearbox}</li>
        </ul>
        <div class="market-foot">
          <strong>${formatPrice(car.price)}</strong>
          <a href="./wyszukiwarka.html?brand=${encodeURIComponent(car.brand)}">Szukaj podobnych</a>
        </div>
      </div>
    </article>
  `;
}

if (featuredGrid && Array.isArray(window.inventory)) {
  featuredGrid.innerHTML = window.inventory.slice(0, 4).map(offerCardTemplate).join('');
}

const reveals = document.querySelectorAll('.section-reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
);

reveals.forEach((node) => observer.observe(node));
