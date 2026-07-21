import { SortOption } from '~/types/enums'
import type { SelectOption } from '~/types/common'

export const SORT_OPTIONS: SelectOption<SortOption>[] = [
  { value: SortOption.Recommended, label: 'Առաջարկվող' },
  { value: SortOption.Price, label: 'Ամենացածր մեկնարկային գին' },
]
