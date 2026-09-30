export function normalizeLoginName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const loginName = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{2,23}$/.test(loginName) ? loginName : null
}
