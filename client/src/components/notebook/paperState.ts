import { rebaseSheetPoint } from './sheetGeometry.ts'
import type { SheetSize } from './sheetGeometry.ts'
export type Point = { x: number; y: number }
export type PaperNote = Point & { id: string; width: number; height: number; text: string }
export type CrumpledNote = { note: PaperNote; phase: 'crumpling' | 'ball'; origin: Point; visualPosition?: Point }
export type DropArea = { left: number; top: number; right: number; bottom: number }
type Draft = { pointerId: number; source: boolean; start: Point; point: Point; offset: Point; note: PaperNote; moved: number; overTrash: boolean }
export type PaperState = { notes: PaperNote[]; crumpled: CrumpledNote[]; draft: Draft | null }
export type PaperAction =
  | { type: 'start'; pointerId: number; point: Point; id: string; source: boolean }
  | { type: 'edit'; id: string; text: string }
  | { type: 'crumple'; id: string; origin: Point }
  | { type: 'crumpleFinished'; id: string }
  | { type: 'rebase'; from: SheetSize; to: SheetSize; oldArea: DropArea; area: DropArea; offset: Point }
  | { type: 'move'; pointerId: number; point: Point; trash?: DropArea }
  | { type: 'finish'; pointerId: number; point: Point; area: DropArea; blocked: boolean; trash?: DropArea }
  | { type: 'cancel'; pointerId: number }
export const initialPaperState: PaperState = { notes: [], crumpled: [], draft: null }

export function insideTrash(point: Point, area?: DropArea): boolean {
  return !!area && point.x >= area.left && point.x < area.right && point.y >= area.top && point.y < area.bottom
}

export function paperReducer(state: PaperState, action: PaperAction): PaperState {
  if (action.type === 'rebase') {
    if (!state.notes.length && !state.draft && !state.crumpled.some(paper => paper.phase === 'crumpling')) return state
    const map = (note: PaperNote, clamp = true) => {
      const { oldArea: old, area: next } = action
      const axis = (value: number, length: number, start: number, end: number, nextStart: number, nextEnd: number) => {
        const position = (value - start) / Math.max(1, end - start - length)
        return nextStart + (clamp ? Math.max(0, Math.min(1, position)) : position) * Math.max(0, nextEnd - nextStart - length)
      }
      return { ...note, x: axis(note.x, note.width, old.left, old.right, next.left, next.right),
        y: axis(note.y, note.height, old.top, old.bottom, next.top, next.bottom) }
    }
    const draft = state.draft
    // A source draft starts outside the drop area; it must stay free to enter it.
    const note = draft ? map(draft.note, false) : null
    const shift = draft && note ? { x: note.x - draft.note.x, y: note.y - draft.note.y } : { x: 0, y: 0 }
    return { ...state, notes: state.notes.map(note => map(note)),
      crumpled: state.crumpled.map(paper => {
        if (paper.phase === 'ball') return paper
        const origin = rebaseSheetPoint(paper.origin, action.from, action.to, 19)
        return { ...paper, origin, visualPosition: { x: origin.x - action.offset.x - paper.note.width / 2, y: origin.y - action.offset.y - paper.note.height / 2 } }
      }),
      draft: draft && note ? { ...draft, note,
        start: { x: draft.start.x + shift.x, y: draft.start.y + shift.y },
        point: { x: draft.point.x + shift.x, y: draft.point.y + shift.y } } : null }
  }
  if (action.type === 'crumple') {
    const note = state.notes.find(value => value.id === action.id)
    if (!note?.text.trim() || state.draft) return state
    return { ...state, notes: state.notes.filter(value => value.id !== action.id),
      crumpled: [...state.crumpled, { note, phase: 'crumpling', origin: action.origin }] }
  }
  if (action.type === 'crumpleFinished') return { ...state,
    crumpled: state.crumpled.map(value => value.note.id === action.id ? { ...value, phase: 'ball' } : value) }
  if (action.type === 'edit') return { ...state, notes: state.notes.map(note => note.id === action.id ? { ...note, text: action.text } : note) }
  if (action.type === 'start') {
    if (state.draft) return state
    const note = action.source ? { id: action.id, x: action.point.x - 26, y: action.point.y - 16, width: 52, height: 32, text: '' }
      : state.notes.find(value => value.id === action.id)
    if (!note) return state
    return { ...state, draft: { pointerId: action.pointerId, source: action.source, start: action.point, point: action.point,
      offset: { x: action.point.x - note.x, y: action.point.y - note.y }, note, moved: 0, overTrash: false } }
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
  if (action.type === 'move') return { ...state, draft: { ...draft, point: action.point, note, moved, overTrash: !draft.source && insideTrash(action.point, action.trash) } }
  if (!draft.source && moved >= 3 && insideTrash(action.point, action.trash)) {
    return { ...state, notes: state.notes.filter(value => value.id !== draft.note.id), draft: null }
  }
  const placed = draft.source ? { ...note, width: 156, height: 108, x: action.point.x - 78, y: action.point.y - 54 } : note
  const area = action.area
  // CSSOM serializes fractional lengths with fewer decimals than pointer
  // coordinates. Accept one layout subpixel at the boundary, then clamp it.
  const epsilon = 1 / 64 + 0.001
  const valid = !action.blocked && moved >= (draft.source ? 24 : 3) &&
    (!draft.source || draft.start.x - action.point.x >= 36) &&
    placed.x >= area.left - epsilon && placed.y >= area.top - epsilon &&
    placed.x + placed.width <= area.right + epsilon && placed.y + placed.height <= area.bottom + epsilon
  const contained = { ...placed, x: Math.max(area.left, Math.min(area.right - placed.width, placed.x)),
    y: Math.max(area.top, Math.min(area.bottom - placed.height, placed.y)) }
  return { ...state, notes: !valid ? state.notes : draft.source ? [...state.notes, contained]
    : state.notes.map(value => value.id === placed.id ? contained : value), draft: null }
}
