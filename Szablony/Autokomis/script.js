const sections = document.querySelectorAll('.section-reveal');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  {
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.2,
  }
);

sections.forEach((section) => observer.observe(section));
