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
  loginName: string
  emailPlaceholder: string
  inviteAction: string
  inviteSuccess: string
  inviteSubmitting: string
  inviteFailed: string
  inviteAuthRequired: string
  inviteLink: string
  pending: string
  active: string
  graphDescription: string
  graphHint: string
  graphLoading: string
  graphEmpty: string
  graphFailed: string
  anonymous: string
  unnamed: string
  language: string
  help: string
  settings: string
  profile: { visible: string; saving: string; failed: string }
  notebook: { pages: string; contacts: string; contactsEmpty: string; history: string; noPapers: string; localOnly: string; sentTo: (name: string) => string; locale: string; pullPaper: string; paperGuidance: string; blankNote: string; moveNote: string; noteText: string; writeHere: string; trash: string; crumple: string; enableTilt: string }
  auth: {
    title: string
    greetings: readonly [string, string, string, string, string, string]
    subtitles: readonly [string, string, string, string]
    login: string
    submitting: string
    logout: string
    loggingOut: string
    required: string
    invalid: string
    failed: string
    checking: string
    sessionFailed: string
    retry: string
    logoutFailed: string
  }
  registration: {
    title: string
    intro: string
    publicName: string
    loginNameHint: string
    invalidLoginName: string
    loginNameTaken: string
    password: string
    confirmPassword: string
    passwordHint: string
    submit: string
    submitting: string
    success: string
    missingToken: string
    required: string
    nameLength: string
    passwordLength: string
    passwordMismatch: string
    invalidInvitation: string
    accountExists: string
    failed: string
  }
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
    loginName: 'Dein Nick',
    emailPlaceholder: 'name@beispiel.de',
    inviteAction: 'Link raushauen',
    inviteSuccess: 'Link ist bereit! Kopier ihn und gib ihn weiter.',
    inviteSubmitting: 'Link wird erstellt …',
    inviteFailed: 'Der Link konnte nicht erstellt werden. Versuch es nochmal.',
    inviteAuthRequired: 'Melde dich erneut an, um jemanden einzuladen.',
    inviteLink: 'Dein Einladungslink',
    pending: 'Noch nicht drin',
    active: 'Ist dabei!',
    graphDescription: 'Den Graphen mit Maus oder einem Finger verschieben. Mit zwei Fingern gleichzeitig zoomen und drehen; mit Mausrad oder Trackpad zoomen. Knoten mit Klick, Eingabe oder Leertaste auswählen.',
    graphHint: 'Graph ziehen · Zwei Finger: zoomen & drehen',
    notebook: { pages: 'Heftseiten', contacts: 'Zettelbuch', contactsEmpty: 'Noch keine Kontakte auf dem Schulhof.', history: 'Verlauf', noPapers: 'Noch keine Zettel. Knüll einen Zettel und wirf ihn in den Kreis.', localOnly: 'Demo: nur in diesem Browser gespeichert, nicht wirklich zugestellt.', sentTo: (name) => `An ${name}`, locale: 'de-DE', pullPaper: 'Papier vom Rand ins Heft ziehen', paperGuidance: 'Zieh dir einen Zettel raus', blankNote: 'Leerer Zettel', moveNote: 'Zettel am Rand verschieben', noteText: 'Dein Zettel', writeHere: 'Schreib drauf …', trash: 'Papierkorb — Zettel hier ablegen', crumple: 'Zusammenknüllen', enableTilt: 'Mit Neigung rollen' },
    graphLoading: 'Der Schulhof wird geladen …',
    graphEmpty: 'Der Schulhof ist noch leer.',
    graphFailed: 'Der Schulhof konnte nicht geladen werden. Bitte versuche es erneut.',
    anonymous: 'Anonymer Knoten',
    unnamed: 'Jemand',
    language: 'Sprache wählen',
    help: 'Hilfe',
    settings: 'Einstellungen',
    profile: { visible: 'Im Schulhof sichtbar', saving: 'Wird gespeichert …', failed: 'Deine Sichtbarkeit konnte nicht gespeichert oder geladen werden. Versuch es nochmal.' },
    auth: {
      title: 'Willkommen zurück',
      greetings: ['Na, wieder da?', 'Was geht?', 'Da bist du ja.', 'Wo warst du denn?', 'Zurück am Start?', 'Yo, Digga 👋'],
      subtitles: ['Dein Schulhof wartet.', 'Mal sehen, was los ist.', 'Zeit, wieder reinzuschauen.', 'Wer hängt heute mit wem ab?'],
      login: 'Ab auf den Schulhof!',
      submitting: 'Anmeldung läuft …',
      logout: 'Abmelden',
      loggingOut: 'Abmeldung läuft …',
      required: 'Bitte gib deinen Nick und deinen Geheimcode ein.',
      invalid: 'Nick oder Geheimcode ist falsch.',
      failed: 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
      checking: 'Anmeldung wird geprüft …',
      sessionFailed: 'Deine Anmeldung konnte nicht geprüft werden. Bitte versuche es erneut.',
      retry: 'Erneut versuchen',
      logoutFailed: 'Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
    },
    registration: {
      title: 'Komm in die Clique',
      intro: 'Mit deiner Einladung kannst du dein Konto erstellen.',
      publicName: 'Anzeigename',
      loginNameHint: '3–24 Zeichen: a–z, 0–9, _ oder -. Beginne mit einem Buchstaben. Groß- und Kleinschreibung spielt keine Rolle.',
      invalidLoginName: 'Wähle einen Nick mit 3–24 Zeichen (a–z, 0–9, _ oder -), der mit einem Buchstaben beginnt.',
      loginNameTaken: 'Dieser Nick ist schon vergeben. Such dir einen anderen aus.',
      password: 'Dein Geheimcode',
      confirmPassword: 'Geheimcode wiederholen',
      passwordHint: '8 bis 128 Zeichen',
      submit: 'Konto erstellen',
      submitting: 'Konto wird erstellt …',
      success: 'Du bist dabei! Dein Konto wurde erstellt.',
      missingToken: 'Der Einladungslink ist unvollständig. Öffne bitte den vollständigen Link aus deiner Einladung.',
      required: 'Bitte fülle alle Felder aus.',
      nameLength: 'Dein Anzeigename darf höchstens 50 Zeichen enthalten.',
      passwordLength: 'Dein Geheimcode muss 8 bis 128 Zeichen enthalten.',
      passwordMismatch: 'Die Geheimcodes stimmen nicht überein.',
      invalidInvitation: 'Die Einladung ist ungültig, abgelaufen oder bereits verwendet. Bitte fordere eine neue Einladung an.',
      accountExists: 'Für die E-Mail-Adresse dieser Einladung besteht bereits ein Konto.',
      failed: 'Dein Konto konnte nicht erstellt werden. Bitte versuche es erneut.',
    },
    nodeDescription: (label, depth, count) => `${label}, Ebene ${depth}, ${count} ${count === 1 ? 'Nachkomme' : 'Nachkommen'}`,
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
    loginName: 'Your nickname',
    emailPlaceholder: 'name@example.com',
    inviteAction: 'Shoot them the link',
    inviteSuccess: 'Link ready! Copy it and pass it on.',
    inviteSubmitting: 'Creating your link …',
    inviteFailed: 'Could not create the link. Give it another try.',
    inviteAuthRequired: 'Log in again to invite someone.',
    inviteLink: 'Your invitation link',
    pending: 'Not in yet',
    active: "They're in!",
    graphDescription: 'Drag the graph with a mouse or one finger. Use two fingers to zoom and rotate together; use a mouse wheel or trackpad to zoom. Select a node with a click, Enter or Space.',
    graphHint: 'Drag graph · Two fingers: zoom & rotate',
    notebook: { pages: 'Notebook pages', contacts: 'Contact book', contactsEmpty: 'No contacts on the schoolyard yet.', history: 'History', noPapers: 'No notes yet. Crumple a note and throw it into their circle.', localOnly: 'Demo: saved only in this browser, not actually delivered.', sentTo: (name) => `To ${name}`, locale: 'en-GB', pullPaper: 'Pull paper from the edge onto the notebook', paperGuidance: 'Pull out a little note', blankNote: 'Blank note', moveNote: 'Drag the edge to move your note', noteText: 'Your note', writeHere: 'Write here …', trash: 'Paper basket — drop a note here', crumple: 'Crumple up', enableTilt: 'Roll with tilt' },
    graphLoading: 'Loading the schoolyard …',
    graphEmpty: 'The schoolyard is still empty.',
    graphFailed: 'The schoolyard could not be loaded. Please try again.',
    anonymous: 'Anonymous node',
    unnamed: 'Someone',
    language: 'Choose language',
    help: 'Help',
    settings: 'Settings',
    profile: { visible: 'Visible in the schoolyard', saving: 'Saving …', failed: 'Could not save or load your visibility. Give it another try.' },
    auth: {
      title: 'Welcome back',
      greetings: ['Hey, back again?', "What's up?", 'There you are.', 'Where have you been?', 'Back in the game?', 'Yo, mate 👋'],
      subtitles: ['Your schoolyard is waiting.', "Let's see what's going on.", 'Time to check back in.', "Who's hanging out with who today?"],
      login: "Let's hit the schoolyard!",
      submitting: 'Logging in …',
      logout: 'Log out',
      loggingOut: 'Logging out …',
      required: 'Enter your nickname and secret code.',
      invalid: 'The nickname or secret code is incorrect.',
      failed: 'Login failed. Please try again.',
      checking: 'Checking your session …',
      sessionFailed: 'Your session could not be checked. Please try again.',
      retry: 'Try again',
      logoutFailed: 'Logout failed. Please try again.',
    },
    registration: {
      title: 'Join the circle',
      intro: 'Use your invitation to create your account.',
      publicName: 'Display name',
      loginNameHint: '3–24 characters: a–z, 0–9, _ or -. Start with a letter. Uppercase and lowercase count as the same nickname.',
      invalidLoginName: 'Choose a nickname with 3–24 characters (a–z, 0–9, _ or -), starting with a letter.',
      loginNameTaken: 'That nickname is taken. Pick another one.',
      password: 'Your secret code',
      confirmPassword: 'Repeat your secret code',
      passwordHint: '8 to 128 characters',
      submit: 'Create account',
      submitting: 'Creating account …',
      success: "You're in! Your account has been created.",
      missingToken: 'The invitation link is incomplete. Please open the full link from your invitation.',
      required: 'Please fill in all fields.',
      nameLength: 'Your display name must contain no more than 50 characters.',
      passwordLength: 'Your secret code must contain 8 to 128 characters.',
      passwordMismatch: 'The secret codes do not match.',
      invalidInvitation: 'The invitation is invalid, expired, or already used. Please request a new invitation.',
      accountExists: 'An account already exists for the email address on this invitation.',
      failed: 'Your account could not be created. Please try again.',
    },
    nodeDescription: (label, depth, count) => `${label}, level ${depth}, ${count} ${count === 1 ? 'descendant' : 'descendants'}`,
    selection: (label) => `${label} selected`,
  },
}

// Public names are used verbatim; only role and state labels are translated.
export function getNodeLabel(kind: GraphNodeKind, publicLabel: string | undefined, copy: Translations) {
  if (kind === 'anonymous') return undefined
  if (kind === 'root') return publicLabel ?? copy.root
  if (kind === 'invitation') return copy.pending
  return publicLabel ?? copy.unnamed
}
