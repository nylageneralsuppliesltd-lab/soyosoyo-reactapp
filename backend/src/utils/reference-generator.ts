/**
 * Reference Number Generator
 * Generates short, human-readable transaction references
 * Format: PREFIX-YYMMDD-XXXX
 * Example: DEP-260215-A7K9, EXP-260215-B3M2
 * 
 * Similar to:
 * - T24 banking system references
 * - MPESA transaction codes
 * - Other financial system transaction IDs
 */

/**
 * Generates a random alphanumeric code (uppercase letters and numbers only)
 * @param length - Length of the random code (default: 4)
 * @returns Random alphanumeric string
 */
function generateRandomCode(length: number = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: I, O, 0, 1
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Formats date as YYMMDD
 * @param date - Date to format (default: now)
 * @returns Date string in YYMMDD format
 */
function formatDateCode(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates a unique transaction reference
 * @param prefix - Transaction type prefix (e.g., 'DEP', 'EXP', 'TRF')
 * @param randomLength - Length of random code (default: 4)
 * @returns Reference string in format: PREFIX-YYMMDD-XXXX
 * 
 * Examples:
 * - generateTransactionReference('DEP') → 'DEP-260215-A7K9'
 * - generateTransactionReference('EXP') → 'EXP-260215-B3M2'
 * - generateTransactionReference('LOAN') → 'LOAN-260215-C5N8'
 */
export function generateTransactionReference(
  prefix: string,
  randomLength: number = 4
): string {
  const dateCode = formatDateCode();
  const randomCode = generateRandomCode(randomLength);
  return `${prefix}-${dateCode}-${randomCode}`;
}

/**
 * Generates an MPESA-style reference (8 characters, all uppercase alphanumeric)
 * @returns 8-character reference code
 * 
 * Example: 'QH7X9Z2P'
 */
export function generateMpesaStyleReference(): string {
  return generateRandomCode(8);
}

/**
 * Validates if a reference matches the expected format
 * @param reference - Reference to validate
 * @returns Boolean indicating if reference is valid
 */
export function isValidReference(reference: string): boolean {
  // Match format: PREFIX-YYMMDD-XXXX
  const pattern = /^[A-Z]{2,10}-\d{6}-[A-Z0-9]{3,6}$/;
  return pattern.test(reference);
}
