/**
 * DETERMINISTIC ACCOUNT RESOLVER FOR TRANSACTION STATEMENT EXTRACTION
 * 
 * Purpose:  Prevent cross-account mixing (e.g., e-wallet→cash) during statement parsing.
 * Pattern: Extract "to" or "from" account hints from description, then use strict keyword rules.
 * 
 * Account Hierarchy (Priority for fallback):
 *   1. Chamasoft E-Wallet (mobileMoney) - "chamasoft" OR "c.e.w" OR "e-wallet" keywords
 *   2. Cooperative Bank (bank) - "cooperative" keyword
 *   3. Cytonn Money Market (bank) - "cytonn" OR "money market" keywords
 *   4. Cash at Hand (cash) - "cash" OR "cash at hand" keywords
 *   5. DEFAULT FALLBACK: Chamasoft E-Wallet (mobileMoney)
 * 
 * Rules:
 *   - Must check in strict order to avoid ambiguity
 *   - "Cash" must be explicitly found to route to Cash account (not just "no match")
 *   - Fallback is always E-Wallet (most transactions are e-wallet based per DB analysis)
 */

class DeterministicAccountResolver {
  constructor(accountMap) {
    /**
     * accountMap: Map of canonicals names → account ID
     * Expected keys (case-insensitive lookup):
     *   - 'Cash at Hand'
     *   - 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W'
     *   - 'Cytonn Money Market Fund - Collection Account'
     *   - 'SOYOSOYO MEDICARE COOPERATIVE SAVINGS CREDIT SOCIETY'
     */
    this.accountMap = new Map(
      [...accountMap].map(([k, v]) => [k.toLowerCase(), v])
    );
  }

  /**
   * MAIN RESOLVER: Takes description text and returns best-match account ID
   * @param {string} description - Raw description from statement
   * @returns {string|null} - Account ID or null if no match
   */
  resolveAccountFromDescription(description) {
    if (!description) return null;

    const normalized = this.normalizeText(description).toLowerCase();

    // Rule 1: Check for EXPLICIT CASH indicators
    // Only route to cash if the word "cash" appears AND it's not ambiguous
    if (this.matchesCashPattern(normalized)) {
      const cashId = this.lookupAccount('cash at hand');
      if (cashId) return cashId;
    }

    // Rule 2: Check for Cooperative Bank indicators (check BEFORE e-wallet)
    if (this.matchesCooperativePattern(normalized)) {
      const coopId = this.lookupAccount('cooperative');
      if (coopId) return coopId;
    }

    // Rule 3: Check for Cytonn/Money Market indicators (check BEFORE e-wallet)
    if (this.matchesCytonnPattern(normalized)) {
      const cytId = this.lookupAccount('cytonn');
      if (cytId) return cytId;
    }

    // Rule 4: Check for Chamasoft/E-Wallet indicators
    // These are EXPLICIT mentions of e-wallet in text
    if (this.matchesChamaSoftPattern(normalized)) {
      const ewId = this.lookupAccount('c.e.w');
      if (ewId) return ewId;
    }

    // DEFAULT: Fallback to E-Wallet (most transactions are e-wallet)
    // This prevents accidental routing to cash when ambiguous
    return this.lookupAccount('c.e.w');
  }

  /**
   * CASH pattern: Only match if "cash" appears but NOT in context of "cash office" expense
   */
  matchesCashPattern(normalized) {
    // MUST have "cash" keyword
    if (!normalized.includes('cash')) return false;

    // EXPLICIT exclusions (these are NOT cash account transactions):
    if (normalized.includes('chamasoft')) return false;
    if (normalized.includes('c.e.w')) return false;
    if (normalized.includes('cooperative')) return false;
    if (normalized.includes('cytonn')) return false;
    if (normalized.includes('e-wallet')) return false;

    // Must be explicit "cash at hand", "cash office", or lone "cash" context
    return /cash(?:\s+at\s+hand|office|box|desk|\s+payment|-to-cash)?/i.test(normalized);
  }

  /**
   * CHAMASOFT/E-WALLET pattern: Look for explicit Chamasoft/C.E.W/e-wallet mentions
   */
  matchesChamaSoftPattern(normalized) {
    return /chamasoft|c\.e\.w|e-?wallet/i.test(normalized);
  }

  /**
   * COOPERATIVE pattern: Look for "cooperative bank" or similar
   */
  matchesCooperativePattern(normalized) {
    // Must have "cooperative" but NOT chamasoft/c.e.w
    return /cooperat(?:ive|or)\s+(?:bank|society|savings)/i.test(normalized) &&
           !this.matchesChamaSoftPattern(normalized);
  }

  /**
   * CYTONN pattern: Look for "cytonn" or "money market fund"
   */
  matchesCytonnPattern(normalized) {
    return /cytonn|money\s+market\s+fund|collection\s+account/i.test(normalized);
  }

  /**
   * Look up account ID by partial name match
   * @param {string} hint - e.g., "cash at hand", "c.e.w", "cooperative", "cytonn"
   * @returns {string|null} - Account ID
   */
  lookupAccount(hint) {
    const hintLower = hint.toLowerCase();

    // Direct key matches
    for (const [key, id] of this.accountMap) {
      if (key === hintLower) return id;
    }

    // Partial key matches
    for (const [key, id] of this.accountMap) {
      if (key.includes(hintLower)) {
        return id;
      }
    }

    // Heuristic matching
    if (hintLower.includes('cash')) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cash')) return id;
      }
    }
    if (hintLower.includes('e-wallet') || hintLower.includes('chamasoft') || hintLower.includes('c.e.w')) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('c.e.w') || key.includes('chamasoft')) return id;
      }
    }
    if (hintLower.includes('cooperative')) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cooperative') && !key.includes('c.e.w')) return id;
      }
    }
    if (hintLower.includes('cytonn')) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cytonn') || key.includes('money market')) return id;
      }
    }

    return null;
  }

  normalizeText(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract "to" or "from" account hints from description text
   * Used for additional context during routing
   */
  extractAccountHints(description) {
    const normalized = this.normalizeText(description);
    const fromMatch = normalized.match(/from\s+(.+?)(?:\s*-|\s*,|\s+for\s|\s+deposited\s+to|$)/i);
    const toMatch = normalized.match(/(?:to|deposited\s+to|withdrawn\s+from)\s+(.+?)(?:\s*-|\s*,|\s+for\s|$)/i);

    return {
      from: fromMatch ? this.normalizeText(fromMatch[1]) : null,
      to: toMatch ? this.normalizeText(toMatch[1]) : null,
    };
  }
}

module.exports = { DeterministicAccountResolver };
