'use strict';

(function () {
  const form = document.getElementById('contactPageForm');
  if (!form) return;

  const topic = document.getElementById('contactTopic');
  const subject = document.getElementById('contactSubject');
  const status = document.getElementById('contactStatus');
  const submit = form.querySelector('[type="submit"]');
  const rateKey = 'ijanek_form_last_submit';
  const rateLimit = 60_000;
  const params = new URLSearchParams(window.location.search);

  function updateSubject() {
    subject.value = 'i-janicki.pl — zapytanie: ' + topic.value;
  }

  const requestedTopic = params.get('temat');
  if (requestedTopic) {
    const option = Array.from(topic.options).find(function (item) {
      return item.value.toLocaleLowerCase('pl') === requestedTopic.toLocaleLowerCase('pl');
    });
    if (option) topic.value = option.value;
  }
  updateSubject();
  topic.addEventListener('change', updateSubject);

  if (params.get('wyslano') === '1') {
    status.className = 'form-status is-ok';
    status.textContent = 'Dziękuję. Wiadomość została wysłana.';
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    status.className = 'form-status';
    status.textContent = '';

    if (!form.reportValidity()) return;

    const lastSubmit = Number(localStorage.getItem(rateKey) || 0);
    if (lastSubmit && Date.now() - lastSubmit < rateLimit) {
      const seconds = Math.ceil((rateLimit - (Date.now() - lastSubmit)) / 1000);
      status.className = 'form-status is-error';
      status.textContent = 'Odczekaj ' + seconds + ' s przed kolejną wiadomością.';
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Wysyłanie…';
    status.textContent = 'Trwa wysyłanie wiadomości…';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Błąd wysyłania');

      localStorage.setItem(rateKey, String(Date.now()));
      form.reset();
      topic.value = 'Wycena';
      updateSubject();
      status.className = 'form-status is-ok';
      status.textContent = 'Dziękuję. Wiadomość została wysłana — odpowiem możliwie szybko.';
    } catch (error) {
      status.className = 'form-status is-error';
      status.innerHTML = 'Nie udało się wysłać formularza. Napisz bezpośrednio na <a href="mailto:kontakt@i-janicki.pl">kontakt@i-janicki.pl</a> lub zadzwoń pod <a href="tel:+48575757817">575 757 817</a>.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Wyślij zapytanie';
    }
  });
})();
