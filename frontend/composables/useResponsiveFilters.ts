/** Desktop: sidebar filters. Mobile: drawer. Manages the drawer state. */
export function useResponsiveFilters() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isDrawerOpen = ref(false)

  watch(isDesktop, (value) => {
    if (value) isDrawerOpen.value = false
  })

  return {
    isDesktop,
    isDrawerOpen,
    openDrawer: () => {
      isDrawerOpen.value = true
    },
    closeDrawer: () => {
      isDrawerOpen.value = false
    },
  }
}
