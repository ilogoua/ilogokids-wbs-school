import { useState } from 'react'
import type { Translations } from '../../i18n/translations'
import type { SentPaper } from './paperHistory'

export type Contact = { id: string; name: string }

export function ContactBook({ contacts, papers, failed, copy, onDelete }: {
  contacts: Contact[]; papers: SentPaper[]; failed: boolean; copy: Translations; onDelete: (id: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Senders not shown on the schoolyard (e.g. anonymous) still appear by their name.
  const known = new Set(contacts.map(contact => contact.id))
  const all = [...contacts]
  for (const paper of papers) {
    if (!known.has(paper.contactNodeId)) {
      known.add(paper.contactNodeId)
      all.push({ id: paper.contactNodeId, name: paper.contactName || copy.unnamed })
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
          <span className="contact-count">{papers.filter(paper => paper.contactNodeId === contact.id).length}</span>
        </button>
      </li>)}
    </ul> : <p>{copy.notebook.contactsEmpty}</p>}
    {failed && <p className="registration-error" role="alert">{copy.notebook.historyFailed}</p>}
  </main>

  const entries = papers.filter(paper => paper.contactNodeId === selected.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  return <main className="history-content">
    <button className="history-back" type="button" onClick={() => setSelectedId(null)}>‹ {copy.notebook.contacts}</button>
    <h2>{copy.notebook.history}: {selected.name}</h2>
    {entries.length ? <ol className="paper-history">
      {entries.map(paper => <li key={paper.id}>
        <details>
          <summary><time dateTime={paper.sentAt}>{formatTime(paper.sentAt)}</time> <span className="paper-direction">{paper.direction === 'sent' ? `→ ${copy.notebook.sent}` : `← ${copy.notebook.received}`}</span> <span>{paper.text.split('\n')[0]}</span></summary>
          <div className="paper-history-sheet">
            <p className="paper-history-meta">{paper.direction === 'sent' ? copy.notebook.sentTo(selected.name) : copy.notebook.receivedFrom(selected.name)} · {formatTime(paper.sentAt)}</p>
            <p>{paper.text}</p>
          </div>
        </details>
        <button className="paper-history-delete" type="button" aria-label={copy.notebook.deletePaper} title={copy.notebook.deletePaper}
          onClick={() => { if (window.confirm(copy.notebook.deleteConfirm)) onDelete(paper.id) }}>
          <svg viewBox="0 0 48 56" aria-hidden="true"><path d="M8 15h32l-5 34H13Z M6 15h36 M18 21l2 22 M30 21l-2 22" /></svg>
        </button>
      </li>)}
    </ol> : <p>{copy.notebook.noPapers}</p>}
    {failed && <p className="registration-error" role="alert">{copy.notebook.historyFailed}</p>}
  </main>
}
