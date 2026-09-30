export type Point = { x: number; y: number }
export type PaperNote = Point & { id: string; width: number; height: number }
export type DropArea = { left: number; top: number; right: number; bottom: number }
type Draft = { pointerId: number; source: boolean; start: Point; point: Point; offset: Point; note: PaperNote; moved: number }
export type PaperState = { notes: PaperNote[]; draft: Draft | null }
export type PaperAction =
  | { type: 'start'; pointerId: number; point: Point; id: string; source: boolean }
  | { type: 'move'; pointerId: number; point: Point }
  | { type: 'finish'; pointerId: number; point: Point; area: DropArea; blocked: boolean }
  | { type: 'cancel'; pointerId: number }
export const initialPaperState: PaperState = { notes: [], draft: null }

export function paperReducer(state: PaperState, action: PaperAction): PaperState {
  if (action.type === 'start') {
    if (state.draft) return state
    const note = action.source ? { id: action.id, x: action.point.x - 26, y: action.point.y - 16, width: 52, height: 32 }
      : state.notes.find(value => value.id === action.id)
    if (!note) return state
    return { ...state, draft: { pointerId: action.pointerId, source: action.source, start: action.point, point: action.point,
      offset: { x: action.point.x - note.x, y: action.point.y - note.y }, note, moved: 0 } }
  }
  const draft = state.draft
  if (!draft || action.pointerId !== draft.pointerId) return state
  if (action.type === 'cancel') return { ...state, draft: null }
  const moved = Math.max(draft.moved, Math.hypot(action.point.x - draft.start.x, action.point.y - draft.start.y))
  const progress = Math.max(0, Math.min(1, (draft.start.x - action.point.x) / 100))
  const width = draft.source ? 52 + progress * 104 : draft.note.width
  const height = draft.source ? 32 + progress * 76 : draft.note.height
  const note = { ...draft.note, width, height,
    x: action.point.x - (draft.source ? width / 2 : draft.offset.x),
    y: action.point.y - (draft.source ? height / 2 : draft.offset.y) }
  if (action.type === 'move') return { ...state, draft: { ...draft, point: action.point, note, moved } }
  const placed = draft.source ? { ...note, width: 156, height: 108, x: action.point.x - 78, y: action.point.y - 54 } : note
  const area = action.area
  const valid = !action.blocked && moved >= (draft.source ? 24 : 3) &&
    (!draft.source || draft.start.x - action.point.x >= 36) &&
    placed.x >= area.left && placed.y >= area.top &&
    placed.x + placed.width <= area.right && placed.y + placed.height <= area.bottom
  return { notes: !valid ? state.notes : draft.source ? [...state.notes, placed]
    : state.notes.map(value => value.id === placed.id ? placed : value), draft: null }
}
