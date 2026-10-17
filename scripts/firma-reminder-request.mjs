const transientCodes = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);
const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);

function networkCodes(error) {
  return [error?.code, ...(error?.errors || []).flatMap(networkCodes),
    ...(error?.cause ? networkCodes(error.cause) : [])].filter(Boolean);
}

// Retry reads and token acquisition only; never repeat delivery or state writes.
export async function requestJson(url, options = {}, runtime = {}) {
  const fetchImpl = runtime.fetch || globalThis.fetch;
  const sleep = runtime.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const warn = runtime.warn || console.warn;
  const endpoint = new URL(url);
  const method = (options.method || 'GET').toUpperCase();
  const canRetry = method === 'GET' || (method === 'POST'
    && endpoint.origin === 'https://oauth2.googleapis.com' && endpoint.pathname === '/token');
  const maxAttempts = canRetry ? 3 : 1;
  // Exclude query parameters, headers and bodies from diagnostic output.
  const label = `${method} ${endpoint.origin}${endpoint.pathname}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    let data;
    let failure;
    let retryable = false;
    try {
      response = await fetchImpl(url, {
        ...options,
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      });
      data = await response.json().catch((error) => {
        if (!response.ok) return {};
        throw error;
      });
    } catch (error) {
      const codes = [...new Set(networkCodes(error))];
      const timedOut = error?.name === 'TimeoutError';
      retryable = timedOut || codes.some((code) => transientCodes.has(code));
      failure = new Error(`${label} failed: ${codes.join(', ') || (timedOut ? 'request timed out' : 'network or JSON response error')}`);
    }
    if (!failure) {
      if (response.ok) return data;
      retryable = transientStatuses.has(response.status);
      failure = new Error(`${label} failed: HTTP ${response.status}`);
    }
    if (!retryable || attempt === maxAttempts || options.signal?.aborted) throw failure;
    const delay = 1000 * 2 ** (attempt - 1);
    warn(`${failure.message}. Retrying (${attempt + 1}/${maxAttempts}) in ${delay}ms.`);
    await sleep(delay);
  }
}
