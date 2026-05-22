const reveals = document.querySelectorAll('.section-reveal');
const railLinks = document.querySelectorAll('.rail-link');
const stage = document.getElementById('hero-stage');
const carWrap = document.querySelector('.car-wrap');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.16,
  }
);

reveals.forEach((section) => revealObserver.observe(section));

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      railLinks.forEach((link) => {
        link.classList.toggle('is-active', link.dataset.target === entry.target.id);
      });
    });
  },
  {
    threshold: 0.5,
  }
);

['start', 'uslugi', 'standard', 'kontakt'].forEach((id) => {
  const section = document.getElementById(id);
  if (section) {
    sectionObserver.observe(section);
  }
});

if (
  stage &&
  carWrap &&
  window.matchMedia('(prefers-reduced-motion: no-preference)').matches
) {
  const moveCar = (x, y) => {
    const driftX = (x - 0.5) * 14;
    const driftY = (y - 0.5) * 9;
    carWrap.style.transform = `translate(calc(-38% + ${driftX * 0.25}px), calc(-50% + ${driftY * 0.25}px))`;
  };

  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    moveCar(x, y);
  });

  stage.addEventListener('pointerleave', () => {
    carWrap.style.transform = 'translate(-38%, -50%)';
  });
}
