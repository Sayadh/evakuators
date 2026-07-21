/**
 * Generates a URL-safe slug from a latin string.
 * Armenian strings should be transliterated manually when creating content.
 */
export function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
