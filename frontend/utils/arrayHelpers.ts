export function groupBy<T, K extends string | number>(items: T[], getKey: (item: T) => K): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = getKey(item)
      ;(acc[key] ??= []).push(item)
      return acc
    },
    {} as Record<K, T[]>,
  )
}

export function uniqueBy<T>(items: T[], getKey: (item: T) => string | number): T[] {
  const seen = new Set<string | number>()
  return items.filter((item) => {
    const key = getKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
