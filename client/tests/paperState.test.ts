import test from 'node:test'
import assert from 'node:assert/strict'
import { paperReducer, initialPaperState } from '../src/components/notebook/paperState.ts'
import type { PaperState } from '../src/components/notebook/paperState.ts'

const area = { left: 0, top: 0, right: 400, bottom: 500 }
const begin = () => paperReducer(initialPaperState, { type: 'start', source: true, id: 'note-1', pointerId: 1, point: { x: 390, y: 200 } })
const release = (state: PaperState, point = { x: 200, y: 200 }, blocked = false) => paperReducer(state, { type: 'finish', pointerId: 1, point, area, blocked })

test('pulling inward unfolds a source and release creates one blank note', () => {
  const start = begin()
  const moved = paperReducer(start, { type: 'move', pointerId: 1, point: { x: 300, y: 200 } })
  assert.ok(moved.draft!.note.width > start.draft!.note.width)
  const done = release(moved)
  assert.equal(done.notes.length, 1)
  assert.equal(done.draft, null)
  assert.deepEqual(done.notes[0], { id: 'note-1', x: 122, y: 146, width: 156, height: 108, text: '' })
  assert.equal(release(done), done, 'duplicate pointer-up cannot duplicate a note')
})

test('tap, outward pull, outside release, controls and cancellation create nothing', () => {
  for (const state of [release(begin(), { x: 390, y: 200 }), release(begin(), { x: 420, y: 200 }),
    release(begin(), { x: -10, y: 200 }), release(begin(), { x: 200, y: 200 }, true),
    paperReducer(begin(), { type: 'cancel', pointerId: 1 })]) {
    assert.deepEqual(state, initialPaperState)
  }
})

test('a second pointer cannot own or finish another active paper gesture', () => {
  const start = begin()
  assert.equal(paperReducer(start, { type: 'start', source: true, id: 'duplicate', pointerId: 2, point: { x: 390, y: 300 } }), start)
  assert.equal(paperReducer(start, { type: 'finish', pointerId: 2, point: { x: 200, y: 200 }, area, blocked: false }), start)
})

test('existing note drag preserves its grab offset and changes no other notes', () => {
  const state = release(begin())
  const start = paperReducer(state, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  const done = release(start, { x: 170, y: 180 })
  assert.deepEqual(done.notes[0], { ...state.notes[0], x: 162, y: 176 })
  assert.equal(done.notes.length, 1)
})

test('failed or cancelled note moves return to the last valid position', () => {
  const state = release(begin())
  const start = paperReducer(state, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  assert.deepEqual(release(start, { x: -100, y: -100 }), state)
  assert.deepEqual(paperReducer(start, { type: 'cancel', pointerId: 1 }), state)
})

const trash = { left: 10, top: 420, right: 60, bottom: 480 }
test('editing is local and survives movement and cancelled gestures', () => {
  const created = release(begin())
  const edited = paperReducer(created, { type: 'edit', id: 'note-1', text: 'Hello\nSchoolyard' })
  assert.equal(edited.notes[0].text, 'Hello\nSchoolyard')
  const dragging = paperReducer(edited, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  assert.equal(release(dragging, { x: 170, y: 180 }).notes[0].text, edited.notes[0].text)
  assert.deepEqual(paperReducer(dragging, { type: 'cancel', pointerId: 1 }), edited)
})

test('trash deletes only an existing dragged note released strictly inside the target', () => {
  const created = release(begin())
  const start = () => paperReducer(created, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  const drop = point => paperReducer(start(), { type: 'finish', pointerId: 1, point, area, blocked: false, trash })
  assert.equal(drop({ x: 30, y: 450 }).notes.length, 0)
  for (const point of [{ x: 9, y: 450 }, { x: 60, y: 450 }, { x: 30, y: 419 }, { x: 30, y: 480 }]) assert.deepEqual(drop(point).notes, created.notes)
  assert.equal(paperReducer(begin(), { type: 'finish', pointerId: 1, point: { x: 30, y: 450 }, area, blocked: false, trash }).notes.length, 0)
})

test('keyboard-sized viewport keeps only the focused note visible without losing text', () => {
  const created = paperReducer(release(begin()), { type: 'edit', id: 'note-1', text: 'Keep this text' })
  const fitted = paperReducer(created, { type: 'keep-visible', id: 'note-1', area: { left: 4, top: 4, right: 280, bottom: 180 } })
  assert.equal(fitted.notes[0].y, 72)
  assert.equal(fitted.notes[0].text, 'Keep this text')
})
