const reveals = document.querySelectorAll('.section-reveal');
const railLinks = document.querySelectorAll('.rail-link');

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
    threshold: 0.52,
  }
);

['start', 'uslugi', 'standard', 'kontakt'].forEach((id) => {
  const section = document.getElementById(id);
  if (section) {
    sectionObserver.observe(section);
  }
});
