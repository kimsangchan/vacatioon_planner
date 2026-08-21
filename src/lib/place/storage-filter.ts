import type { PlaceRow } from '@/lib/trips/bundle'
import type { PlaceCategory } from './category'

export type StorageCategory = 'all' | PlaceCategory

export interface StorageFilter {
  category: StorageCategory
  query: string
}

export type StorageCategoryCounts = Readonly<Record<StorageCategory, number>>

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

export function storageCategoryCounts(places: readonly PlaceRow[]): StorageCategoryCounts {
  return places.reduce<StorageCategoryCounts>(
    (counts, place) => ({
      ...counts,
      all: counts.all + 1,
      [place.category]: counts[place.category] + 1,
    }),
    { all: 0, restaurant: 0, lodging: 0, spot: 0 },
  )
}

export function filterStoragePlaces(
  places: readonly PlaceRow[],
  filter: Readonly<StorageFilter>,
): PlaceRow[] {
  const query = normalizeSearchText(filter.query)

  return places.filter((place) => {
    if (filter.category !== 'all' && place.category !== filter.category) return false
    if (!query) return true

    return [place.name, place.address, place.road_address]
      .some((value) => normalizeSearchText(value).includes(query))
  })
}
