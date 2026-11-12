(() => {
  const { placement, dock } = document.currentScript.dataset;
  const container = dock ? document.querySelector(dock) : document.body;
  const call = document.createElement('a');
  call.className = 'ijanicki-quick-call';
  call.href = 'tel:575757817';
  call.setAttribute('aria-label', 'Zadzwoń do Igora pod numer 575 757 817');
  if (placement) call.dataset.placement = placement;
  call.innerHTML = `
    <span class="ijanicki-quick-call-message">
      <strong id="ijanicki-quick-call-status">Igor jest <span>online</span></strong>
      <span>Zadzwoń</span>
    </span>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 20 20 0 0 1-8.6-3.1 20 20 0 0 1-6-6 20 20 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7 13 13 0 0 0 .7 2.8 2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4 13 13 0 0 0 2.8.7 2 2 0 0 1 1.7 2Z"/>
    </svg>
  `;
  (container ?? document.body).append(call);

  window.setTimeout(() => {
    call.classList.add('is-expanded');
    call.setAttribute('aria-describedby', 'ijanicki-quick-call-status');
  }, 5_000);
})();
