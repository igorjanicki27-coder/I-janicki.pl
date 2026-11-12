'use strict';

(() => {
  const form = document.getElementById('contactForm');
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[role="status"]');
  const sender = form.elements.namedItem('name');
  const contact = form.elements.namedItem('contact');
  const message = form.elements.namedItem('message');
  const rateKey = 'ijanek_form_last_submit';
  const rateLimit = 60_000;
  const leadsEndpoint = 'https://firestore.googleapis.com/v1/projects/i-janicki/databases/(default)/documents/contact_leads';
  const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let lastSubmit = 0;

  function showStatus(text, state = '') {
    status.textContent = text;
    status.dataset.state = state;
  }

  function cooldownSeconds() {
    let latest = lastSubmit;
    try {
      const stored = Number(localStorage.getItem(rateKey));
      if (stored <= Date.now()) latest = Math.max(latest, stored);
    } catch { /* Wystarczy limit obowiązujący na tej stronie. */ }
    return Math.ceil((latest + rateLimit - Date.now()) / 1000);
  }

  async function saveConsent(name, email, acceptedAt) {
    const [firstName, ...lastName] = name.split(/\s+/);
    const response = await fetch(leadsEndpoint, {
      method: 'POST',
      headers: jsonHeaders,
      keepalive: true,
      body: JSON.stringify({
        fields: {
          firstName: { stringValue: firstName },
          lastName: { stringValue: lastName.join(' ') },
          email: { stringValue: email.toLowerCase() },
          consentAcceptedDates: { arrayValue: { values: [{ timestampValue: acceptedAt }] } },
        },
      }),
    });
    if (!response.ok) throw new Error(`Firestore HTTP ${response.status}`);
  }

  for (const field of [sender, contact, message]) {
    field.addEventListener('input', () => field.setCustomValidity(''));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    showStatus('');

    const name = sender.value.trim();
    const reply = contact.value.trim();
    const text = message.value.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reply);
    const isPhone = /^\+?[\d ().-]+$/.test(reply) && /^\d{7,15}$/.test(reply.replace(/\D/g, ''));
    sender.setCustomValidity(name.length < sender.minLength ? 'Wpisz co najmniej 2 znaki.' : '');
    contact.setCustomValidity(isEmail || isPhone ? '' : 'Podaj poprawny e-mail albo numer telefonu.');
    message.setCustomValidity(text.length < message.minLength ? 'Wpisz co najmniej 10 znaków.' : '');
    if (!form.reportValidity()) return;

    const seconds = cooldownSeconds();
    if (seconds > 0) {
      showStatus(`Odczekaj ${seconds} s przed wysłaniem kolejnej wiadomości.`, 'error');
      return;
    }

    const payload = new FormData(form);
    payload.set('name', name);
    payload.set('message', text);
    payload.delete('contact');
    payload.set(isEmail ? 'email' : 'phone', reply);
    const acceptedAt = new Date().toISOString();

    submit.disabled = true;
    showStatus('Wysyłanie wiadomości…');
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(Object.fromEntries(payload)),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Web3Forms rejected the submission');

      if (isEmail) {
        saveConsent(name, reply, acceptedAt).catch((error) => {
          console.warn('Nie udało się zapisać daty zgody w Firebase.', error);
        });
      }
      lastSubmit = Date.now();
      try {
        localStorage.setItem(rateKey, String(lastSubmit));
      } catch { /* Wiadomość została już wysłana. */ }
      form.reset();
      showStatus('Dziękuję. Wiadomość została wysłana.', 'success');
    } catch {
      showStatus('Nie udało się wysłać wiadomości. Spróbuj ponownie lub skorzystaj z e-maila albo telefonu.', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  submit.disabled = false;
})();
