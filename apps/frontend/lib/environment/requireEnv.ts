/**
 * Validates and retrieves an environment variable.
 * Returns the value if present, otherwise returns null.
 * 
 * NEVER throws. Missing env vars are handled by the caller (returning JSON errors).
 */
export function requireEnv(name: string): string | null {
    const value = process.env[name];
    if (!value || value.trim() === '') {
        return null;
    }
    return value;
}
