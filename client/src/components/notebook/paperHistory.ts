// Local demo persistence only: papers stay in this browser's localStorage.
// Nothing here is delivered to, or readable by, the recipient.
export type SentPaper = { id: string; actorId: string; actorName: string; text: string; sentAt: string }

const STORAGE_PREFIX = 'ilogokids.paperHistory.v1:'

function isSentPaper(value: unknown): value is SentPaper {
  const paper = value as Partial<SentPaper> | null
  return !!paper && typeof paper.id === 'string' && typeof paper.actorId === 'string' &&
    typeof paper.actorName === 'string' && typeof paper.text === 'string' && typeof paper.sentAt === 'string'
}

export function loadPaperHistory(owner: string): SentPaper[] {
  if (!owner) return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + owner) ?? '[]')
    return Array.isArray(value) ? value.filter(isSentPaper) : []
  } catch {
    return []
  }
}

export function savePaperHistory(owner: string, papers: SentPaper[]) {
  if (!owner) return
  try {
    localStorage.setItem(STORAGE_PREFIX + owner, JSON.stringify(papers))
  } catch { /* Storage can be full or blocked; the session history still works. */ }
}
