import type { GraphNodeKind } from '../components/graph/graphTypes'

export type Language = 'de' | 'en'

export type Translations = {
  title: string
  subtitle: string
  root: string
  circle: string
  inviteTitle: string
  inviteQuestion: string
  email: string
  emailPlaceholder: string
  inviteAction: string
  inviteSuccess: string
  pending: string
  active: string
  center: string
  zoomIn: string
  zoomOut: string
  viewportControls: string
  graphDescription: string
  graphHint: string
  anonymous: string
  unnamed: string
  language: string
  help: string
  settings: string
  nodeDescription: (label: string, depth: number, count: number) => string
  selection: (label: string) => string
}

export const translations: Record<Language, Translations> = {
  de: {
    title: 'Schulhof',
    subtitle: 'Wer hängt mit wem ab?',
    root: 'Direx',
    circle: 'Deine Clique',
    inviteTitle: 'Hol wen in deine Clique',
    inviteQuestion: 'Wen willst du dazuholen?',
    email: 'E-Mail',
    emailPlaceholder: 'name@beispiel.de',
    inviteAction: 'Link raushauen',
    inviteSuccess: 'Link ist raus!',
    pending: 'Noch nicht drin',
    active: 'Ist dabei!',
    center: 'Zentrieren',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    viewportControls: 'Graphansicht steuern',
    graphDescription: 'Mit dem Mausrad oder Trackpad zoomen. Den freien Hintergrund zum Verschieben ziehen. Knoten mit Klick, Eingabe oder Leertaste auswählen.',
    graphHint: 'Ziehen zum Bewegen · Scrollen zum Zoomen',
    anonymous: 'Anonymer Knoten',
    unnamed: 'Jemand',
    language: 'Sprache wählen',
    help: 'Hilfe',
    settings: 'Einstellungen',
    nodeDescription: (label, depth, count) => `${label}, Ebene ${depth}, ${count} ${count === 1 ? 'Verbindung' : 'Verbindungen'}`,
    selection: (label) => `${label} ausgewählt`,
  },
  en: {
    title: 'Schoolyard',
    subtitle: 'Who hangs with who?',
    root: 'Principal',
    circle: 'Your circle',
    inviteTitle: 'Bring someone in',
    inviteQuestion: 'Who are you bringing in?',
    email: 'Email',
    emailPlaceholder: 'name@example.com',
    inviteAction: 'Shoot them the link',
    inviteSuccess: "They've got the link!",
    pending: 'Not in yet',
    active: "They're in!",
    center: 'Center',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    viewportControls: 'Graph view controls',
    graphDescription: 'Zoom with a mouse wheel or trackpad. Drag empty space to move the graph. Select a node with a click, Enter or Space.',
    graphHint: 'Drag to move · Scroll to zoom',
    anonymous: 'Anonymous node',
    unnamed: 'Someone',
    language: 'Choose language',
    help: 'Help',
    settings: 'Settings',
    nodeDescription: (label, depth, count) => `${label}, level ${depth}, ${count} ${count === 1 ? 'connection' : 'connections'}`,
    selection: (label) => `${label} selected`,
  },
}

// Public names are used verbatim; only role and state labels are translated.
export function getNodeLabel(kind: GraphNodeKind, publicLabel: string | undefined, copy: Translations) {
  if (kind === 'anonymous') return undefined
  if (kind === 'root') return copy.root
  if (kind === 'invitation') return copy.pending
  return publicLabel ?? copy.unnamed
}
