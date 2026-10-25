// Outside the Next.js runtime `cacheLife()` and friends throw. Under test, cached
// functions simply run uncached, so every call hits the test database.
export const cacheLife = (): void => {}
export const cacheTag = (): void => {}
export const revalidateTag = (): void => {}
export const updateTag = (): void => {}
export const revalidatePath = (): void => {}
