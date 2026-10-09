import { useState } from 'react'
import type { Translations } from '../../i18n/translations'
import type { SentPaper } from './paperHistory'

export type Contact = { id: string; name: string }

export function ContactBook({ contacts, papers, copy }: { contacts: Contact[]; papers: SentPaper[]; copy: Translations }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Actors who left the schoolyard keep their saved papers under the stored name.
  const known = new Set(contacts.map(contact => contact.id))
  const all = [...contacts]
  for (const paper of papers) {
    if (!known.has(paper.actorId)) {
      known.add(paper.actorId)
      all.push({ id: paper.actorId, name: paper.actorName })
    }
  }
  const selected = all.find(contact => contact.id === selectedId)
  const formatTime = (value: string) => new Date(value).toLocaleString(copy.notebook.locale, { dateStyle: 'medium', timeStyle: 'short' })

  if (!selected) return <main className="history-content">
    <h2>{copy.notebook.contacts}</h2>
    {all.length ? <ul className="contact-list">
      {all.map(contact => <li key={contact.id}>
        <button type="button" onClick={() => setSelectedId(contact.id)}>
          <span>{contact.name}</span>
          <span className="contact-count">{papers.filter(paper => paper.actorId === contact.id).length}</span>
        </button>
      </li>)}
    </ul> : <p>{copy.notebook.contactsEmpty}</p>}
    <p className="history-note">{copy.notebook.localOnly}</p>
  </main>

  const entries = papers.filter(paper => paper.actorId === selected.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  return <main className="history-content">
    <button className="history-back" type="button" onClick={() => setSelectedId(null)}>‹ {copy.notebook.contacts}</button>
    <h2>{copy.notebook.history}: {selected.name}</h2>
    {entries.length ? <ol className="paper-history">
      {entries.map(paper => <li key={paper.id}>
        <details>
          <summary><time dateTime={paper.sentAt}>{formatTime(paper.sentAt)}</time> <span>{paper.text.split('\n')[0]}</span></summary>
          <div className="paper-history-sheet">
            <p className="paper-history-meta">{copy.notebook.sentTo(paper.actorName)} · {formatTime(paper.sentAt)}</p>
            <p>{paper.text}</p>
          </div>
        </details>
      </li>)}
    </ol> : <p>{copy.notebook.noPapers}</p>}
    <p className="history-note">{copy.notebook.localOnly}</p>
  </main>
}
