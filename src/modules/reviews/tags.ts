/** Quick compliments a customer can add to a review (shown on the public profile). */
export const REVIEW_TAG_LABELS = {
  on_time: 'On time',
  polite: 'Polite',
  fair_price: 'Fair price',
  clean_work: 'Clean work',
  skilled: 'Skilled',
  explained_well: 'Explained well',
} as const

export type ReviewTag = keyof typeof REVIEW_TAG_LABELS
export const REVIEW_TAGS = Object.keys(REVIEW_TAG_LABELS) as ReviewTag[]

export const reviewTagLabel = (tag: string): string => REVIEW_TAG_LABELS[tag as ReviewTag] ?? tag
