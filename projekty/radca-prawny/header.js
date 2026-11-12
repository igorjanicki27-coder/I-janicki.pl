const pageHeader = document.querySelector('.page-header');
const navToggle = pageHeader.querySelector('.nav-toggle');
const navDropdowns = pageHeader.querySelectorAll('.nav-dropdown');
const mobileNav = window.matchMedia('(max-width: 620px)');

function updateHeaderVisibility() {
  pageHeader.classList.toggle('is-visible', window.scrollY > 24);
}

updateHeaderVisibility();
window.addEventListener('scroll', updateHeaderVisibility, { passive: true });
window.addEventListener('pageshow', updateHeaderVisibility);

function setMenuOpen(open) {
  navToggle.setAttribute('aria-expanded', String(open));
  pageHeader.classList.toggle('is-menu-open', open);
}

navToggle.hidden = false;
navToggle.addEventListener('click', () => {
  setMenuOpen(navToggle.getAttribute('aria-expanded') !== 'true');
});
mobileNav.addEventListener('change', () => setMenuOpen(false));

document.addEventListener('click', (event) => {
  if (!pageHeader.contains(event.target) || event.target.closest('.page-header a')) {
    setMenuOpen(false);
  }

  for (const dropdown of navDropdowns) {
    if (!dropdown.contains(event.target) || event.target.closest('a')) {
      dropdown.open = false;
    }
  }
});

document.addEventListener('focusin', (event) => {
  const insideHeader = pageHeader.contains(event.target);
  if (!insideHeader) setMenuOpen(false);
  // Closing a submenu as a link gains focus would move the link before the click.
  if (insideHeader && pageHeader.classList.contains('is-menu-open')) return;

  for (const dropdown of navDropdowns) {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  const openDropdown = pageHeader.querySelector('.nav-dropdown[open]');
  if (openDropdown) {
    event.preventDefault();
    openDropdown.open = false;
    openDropdown.querySelector('summary').focus();
  } else if (navToggle.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    setMenuOpen(false);
    navToggle.focus();
  }
});
