(() => {
  const link = document.querySelector('[data-dev-link]');
  if (!link) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let overlay;
  let redirectTimer;

  link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
        || event.shiftKey || event.altKey || reducedMotion.matches) return;

    event.preventDefault();
    if (redirectTimer !== undefined) return;

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'dev-loader-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `
        <div class="loader">
          <span><span></span><span></span><span></span><span></span></span>
          <div class="base"><span></span><div class="face"></div></div>
        </div>
        <div class="longfazers"><span></span><span></span><span></span><span></span></div>
      `;
      document.body.append(overlay);
    }
    overlay.hidden = false;

    const destination = link.href;
    redirectTimer = window.setTimeout(() => window.location.assign(destination), 1000);
  });

  window.addEventListener('pageshow', () => {
    window.clearTimeout(redirectTimer);
    redirectTimer = undefined;
    if (overlay) overlay.hidden = true;
  });
})();
