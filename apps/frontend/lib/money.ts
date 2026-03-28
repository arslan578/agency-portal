/**
 * Parses a USD currency string into integer cents.
 * 
 * Supports formats: "100", "100.50", "$100.50", " 100 ".
 * Rejects invalid formats by returning 0.
 * 
 * @param amount - The currency string to parse.
 * @returns The amount in cents (integer). Returns 0 if invalid.
 */
export function usdToCents(amount: string): number {
    if (!amount) return 0;

    // Strip whitespace and '$'
    const clean = amount.trim().replace(/^\$/, '');

    // Validate format: strictly digits, optionally followed by dot and 1-2 digits
    const validRegex = /^\d+(\.\d{1,2})?$/;
    if (!validRegex.test(clean)) {
        return 0;
    }

    const parts = clean.split('.');
    const dollars = parseInt(parts[0], 10);

    // Handle cents part
    let cents = 0;
    if (parts.length > 1) {
        let centsStr = parts[1];
        if (centsStr.length === 1) {
            centsStr += '0'; // "10.5" -> "10.50"
        }
        cents = parseInt(centsStr, 10);
    }

    return (dollars * 100) + cents;
}
