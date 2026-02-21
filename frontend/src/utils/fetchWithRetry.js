/**
 * Global fetch wrapper with automatic retry and timeout
 * Handles network errors gracefully without showing errors to users
 */

import { getAuthToken, notifyAuthExpired } from './authSession';

export const fetchWithRetry = async (
  url,
  options = {}
) => {
  const {
    maxRetries = 3,
    timeout = 15000,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    ...fetchOptions
  } = options;

  let lastError;
  let delayMs = baseDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const token = getAuthToken();
        const headers = new Headers(fetchOptions.headers || {});
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await fetch(url, {
          ...fetchOptions,
          headers,
          signal: controller.signal,
        });

        if (response.status === 401) {
          notifyAuthExpired();
        }

        clearTimeout(timeoutId);
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.name === 'AbortError') {
        // Timeout - retry on next iteration
        if (attempt === maxRetries) {
          throw new Error('Request timeout - server may be starting up. Retried 3 times.');
        }
      } else if (error instanceof TypeError) {
        // Network error (CORS, connection refused, etc) - retry
        if (attempt === maxRetries) {
          throw new Error('Network error - connection failed');
        }
      } else {
        // Unknown error - don't retry
        throw error;
      }

      // Calculate next delay with exponential backoff
      delayMs = Math.min(delayMs * 2, maxDelayMs);
      const jitter = delayMs * 0.1 * Math.random();

      if (import.meta.env.DEV) {
        console.debug(`Retry ${attempt + 1}/${maxRetries} after ${delayMs + jitter}ms for ${url}`);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }
  }

  throw lastError;
};
