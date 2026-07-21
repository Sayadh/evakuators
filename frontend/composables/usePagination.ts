/** Simple "load more" pagination over an in-memory list */
export function usePagination<T>(items: ComputedRef<T[]> | Ref<T[]>, perPage = 9) {
  const visibleCount = ref(perPage)

  watch(
    () => items.value.length,
    () => {
      visibleCount.value = perPage
    },
  )

  const visibleItems = computed(() => items.value.slice(0, visibleCount.value))
  const hasMore = computed(() => visibleCount.value < items.value.length)

  function loadMore(): void {
    visibleCount.value += perPage
  }

  return { visibleItems, hasMore, loadMore }
}
