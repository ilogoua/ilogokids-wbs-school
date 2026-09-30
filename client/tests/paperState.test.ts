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
  assert.deepEqual(done.notes[0], { id: 'note-1', x: 122, y: 146, width: 156, height: 108 })
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
