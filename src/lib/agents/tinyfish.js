/**
 * TinyFish Agent API helper functions
 * Handles async automation runs with polling
 */

const TINYFISH_API_BASE = 'https://agent.tinyfish.ai/v1';
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;

const RUN_TIMEOUT_MS = 90000; // 90 seconds
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const IN_FLIGHT_REUSE_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Normalize medicine name for caching
 */
export function normalizeMedicineKey(name, strength) {
  const normalized = (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const strengthNormalized = (strength || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return strengthNormalized ? `${normalized} ${strengthNormalized}` : normalized;
}

/**
 * Normalize name for comparison (remove Dr., punctuation, extra spaces)
 */
export function normalizeNameForComparison(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^dr\.?\s*/i, '')
    .replace(/[.,;:'"()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if registry status looks active/valid
 */
export function isActiveStatus(status) {
  if (!status) return false;
  const activeKeywords = ['active', 'registered', 'valid', 'current', 'good standing'];
  const statusLower = status.toLowerCase();
  return activeKeywords.some(keyword => statusLower.includes(keyword));
}

/**
 * Start a TinyFish async run
 */
export async function startTinyFishRun(url, goal) {
  if (!TINYFISH_API_KEY) {
    throw new Error('TinyFish API key not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for start

  try {
    const response = await fetch(`${TINYFISH_API_BASE}/automation/run-async`, {
      method: 'POST',
      headers: {
        'X-API-Key': TINYFISH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, goal }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TinyFish API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (!data.run_id) {
      throw new Error('No run_id returned from TinyFish');
    }

    return data.run_id;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('TinyFish start request timed out');
    }
    throw err;
  }
}

/**
 * Get TinyFish run status
 */
export async function getTinyFishRunStatus(runId) {
  if (!TINYFISH_API_KEY) {
    throw new Error('TinyFish API key not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for status

  try {
    const response = await fetch(`${TINYFISH_API_BASE}/runs/${runId}`, {
      method: 'GET',
      headers: {
        'X-API-Key': TINYFISH_API_KEY,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TinyFish API error: ${response.status} ${text}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('TinyFish status request timed out');
    }
    throw err;
  }
}

/**
 * Cancel a TinyFish run
 */
export async function cancelTinyFishRun(runId) {
  if (!TINYFISH_API_KEY) {
    throw new Error('TinyFish API key not configured');
  }

  try {
    const response = await fetch(`${TINYFISH_API_BASE}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'X-API-Key': TINYFISH_API_KEY,
      },
    });

    // Best-effort - don't throw on failure
    if (!response.ok) {
      console.warn(`Failed to cancel TinyFish run ${runId}: ${response.status}`);
    }
  } catch (err) {
    console.warn(`Error cancelling TinyFish run ${runId}:`, err.message);
  }
}

/**
 * Parse result defensively (handle object or JSON string)
 */
export function parseAgentResult(result) {
  if (!result) return null;
  if (typeof result === 'object') return result;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Check if run is still running
 */
export function isRunRunning(status) {
  return status === 'running' || status === 'pending';
}

/**
 * Check if run is terminal
 */
export function isRunTerminal(status) {
  return ['completed', 'failed', 'cancelled', 'timeout'].includes(status);
}
