export interface BreadcrumbItem {
  label: string
  to?: string
}

export interface FaqItem {
  question: string
  answer: string
}

export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
}
