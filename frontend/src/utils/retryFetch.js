/**
 * Retry utility for API calls with exponential backoff
 * Silently retries failed requests without showing errors to the user
 */

export const retryFetch = async (
  fn,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    onRetry = null,
    shouldRetry = (error) => {
      // Retry on network errors, timeouts, and 5xx errors
      // Don't retry on 4xx errors (bad request, not found, etc)
      if (!error.response) return true; // Network error
      const status = error.response.status;
      return status >= 500 || status === 408 || status === 429;
    },
  } = options;

  let lastError;
  let delayMs = baseDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calculate next delay with exponential backoff
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);

      // Add jitter to prevent thundering herd
      const jitter = delayMs * 0.1 * Math.random();
      const actualDelay = delayMs + jitter;

      // Call retry callback if provided (for logging)
      if (onRetry) {
        onRetry(attempt + 1, maxRetries, actualDelay, error);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }

  throw lastError;
};

/**
 * Axios interceptor to add retry logic
 * Use this in API instances to enable automatic retries
 */
export const createRetryInterceptor = (axiosInstance, options = {}) => {
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;

      // Mark if we've already retried to prevent infinite loops
      if (!config._retryCount) {
        config._retryCount = 0;
      }

      const { maxRetries = 3 } = options;

      if (config._retryCount < maxRetries) {
        config._retryCount += 1;

        // Exponential backoff
        const delayMs = Math.min(1000 * Math.pow(2, config._retryCount - 1), 10000);
        const jitter = delayMs * 0.1 * Math.random();

        await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));

        return axiosInstance(config);
      }

      return Promise.reject(error);
    }
  );
};
