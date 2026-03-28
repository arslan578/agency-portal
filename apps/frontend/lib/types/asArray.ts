/**
 * Safely casts a value to an array.
 * If the value is not an array, returns an empty array.
 * Use this to prevent UI crashes like "map is not a function".
 */
export function asArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}
