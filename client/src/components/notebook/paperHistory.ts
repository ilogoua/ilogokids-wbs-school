// Papers are stored by the school server (MongoDB) and loaded on demand.
// Old local demo entries in localStorage are intentionally ignored.
export type SentPaper = {
  id: string
  direction: 'sent' | 'received'
  contactNodeId: string
  contactName: string
  text: string
  sentAt: string
}

export async function fetchPapers(): Promise<SentPaper[]> {
  const response = await fetch('/api/papers', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('Papers request failed')
  const body: { papers: SentPaper[] } = await response.json()
  return body.papers
}

export async function sendPaper(clientId: string, recipientNodeId: string, text: string): Promise<SentPaper> {
  const response = await fetch('/api/papers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, recipientNodeId, text }),
  })
  if (!response.ok) throw new Error('Paper was not accepted')
  const body: { paper: SentPaper } = await response.json()
  return body.paper
}

export async function deletePaper(id: string): Promise<void> {
  const response = await fetch(`/api/papers/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Paper delete failed')
}
