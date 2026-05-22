const reveals = document.querySelectorAll('.section-reveal');
const railLinks = document.querySelectorAll('.rail-link');
const stage = document.getElementById('hero-stage');

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
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.14,
  }
);

reveals.forEach((section) => revealObserver.observe(section));

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const id = entry.target.id;
      railLinks.forEach((link) => {
        link.classList.toggle('is-active', link.dataset.target === id);
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

if (stage && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const moveX = (x - 0.5) * 12;
    const moveY = (y - 0.5) * 8;

    stage.style.setProperty('--stage-x', `${moveX}px`);
    stage.style.setProperty('--stage-y', `${moveY}px`);

    const image = stage.querySelector('img');
    if (image) {
      image.style.transform = `translate(${moveX * 0.35}px, ${moveY * 0.35}px) scale(1.06)`;
    }
  });

  stage.addEventListener('pointerleave', () => {
    const image = stage.querySelector('img');
    if (image) {
      image.style.transform = 'translate(0px, 0px) scale(1.06)';
    }
  });
}
