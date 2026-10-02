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

const desktopRelease = (state: PaperState, point: { x: number; y: number }, blocked = false) =>
  paperReducer(state, { type: 'finish', pointerId: 1, point, area, sourceArea: area, blocked })

test('desktop source drops survive in any direction and clamp the whole note inside the sheet', () => {
  for (const point of [{ x: 395, y: 240 }, { x: 390, y: 160 }, { x: 5, y: 5 }, { x: 395, y: 495 }]) {
    const done = desktopRelease(begin(), point)
    assert.equal(done.notes.length, 1)
    const note = done.notes[0]
    assert.equal(note.width, 156); assert.equal(note.height, 108)
    assert.equal(note.x, Math.max(area.left, Math.min(area.right - 156, point.x - 78)))
    assert.equal(note.y, Math.max(area.top, Math.min(area.bottom - 108, point.y - 54)))
    assert.equal(done.draft, null)
  }
})

test('desktop source taps, small jitter, outside releases and protected controls create nothing', () => {
  for (const point of [{ x: 390, y: 200 }, { x: 387, y: 203 }, { x: -1, y: 200 }, { x: 401, y: 200 }]) {
    assert.deepEqual(desktopRelease(begin(), point), initialPaperState)
  }
  assert.deepEqual(desktopRelease(begin(), { x: 200, y: 200 }, true), initialPaperState)
})

test('desktop release outside the old placement rectangle survives and clamps inside the usable area', () => {
  const done = paperReducer(begin(), { type: 'finish', pointerId: 1, point: { x: 440, y: 540 }, area,
    sourceArea: { left: 0, top: 0, right: 450, bottom: 550 }, blocked: false })
  assert.deepEqual(done.notes, [{ id: 'note-1', x: 244, y: 392, width: 156, height: 108, text: '' }])
})

test('touch source rules and existing note placement remain unchanged by the desktop source area', () => {
  for (const point of [{ x: 395, y: 240 }, { x: 390, y: 160 }, { x: 5, y: 5 }, { x: 395, y: 495 }]) {
    assert.deepEqual(release(begin(), point), initialPaperState)
  }
  const created = release(begin())
  const start = paperReducer(created, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  assert.deepEqual(desktopRelease(start, { x: 5, y: 5 }), created)
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

test('only written notes crumple; original text, identity and coordinates stay associated', () => {
  const created = release(begin())
  assert.equal(paperReducer(created, { type: 'crumple', id: 'note-1', origin: { x: 210, y: 270 } }), created)
  const whitespace = paperReducer(created, { type: 'edit', id: 'note-1', text: '  \n ' })
  assert.equal(paperReducer(whitespace, { type: 'crumple', id: 'note-1', origin: { x: 210, y: 270 } }), whitespace)
  const written = paperReducer(created, { type: 'edit', id: 'note-1', text: 'Keep my\noriginal text' })
  const collapsing = paperReducer(written, { type: 'crumple', id: 'note-1', origin: { x: 210, y: 270 } })
  assert.equal(collapsing.notes.length, 0)
  assert.deepEqual(collapsing.crumpled, [{ note: written.notes[0], phase: 'crumpling', origin: { x: 210, y: 270 } }])
  assert.equal(paperReducer(collapsing, { type: 'crumple', id: 'note-1', origin: { x: 0, y: 0 } }), collapsing)
  const finished = paperReducer(collapsing, { type: 'crumpleFinished', id: 'note-1' })
  assert.equal(finished.crumpled[0].phase, 'ball')
  assert.equal(finished.crumpled[0].note, written.notes[0])
  assert.deepEqual(paperReducer(finished, { type: 'crumpleFinished', id: 'note-1' }), finished)
})

test('a fractional boundary drop tolerates CSSOM rounding, clamps, and still rejects an outside drop', () => {
  const created = release(begin())
  const start = () => paperReducer(created, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  const fractional = { ...area, bottom: 500.609 }
  const drop = (extra: number) => paperReducer(start(), { type: 'finish', pointerId: 1,
    point: { x: 130, y: fractional.bottom - 108 + 4 + extra }, area: fractional, blocked: false })
  assert.equal(drop(0.000375).notes[0].y + 108, fractional.bottom)
  assert.deepEqual(drop(0.02).notes, created.notes)
})

test('sheet rebasing preserves flat note text and active pointer ownership and grab offset', () => {
  const created = paperReducer(release(begin()), { type: 'edit', id: 'note-1', text: 'Keep my text' })
  const start = paperReducer(created, { type: 'start', source: false, id: 'note-1', pointerId: 1, point: { x: 130, y: 150 } })
  const nextArea = { left: 0, top: 0, right: 600, bottom: 300 }
  const next = paperReducer(start, { type: 'rebase', from: { width: 400, height: 500 }, to: { width: 600, height: 300 }, oldArea: area, area: nextArea, offset: { x: 0, y: 0 } })
  assert.equal(next.notes[0].text, created.notes[0].text)
  assert.equal(next.draft!.pointerId, 1)
  assert.deepEqual(next.draft!.offset, start.draft!.offset)
  const moved = paperReducer(next, { type: 'move', pointerId: 1, point: next.draft!.point })
  assert.deepEqual(moved.draft!.note, next.draft!.note, 'first move in the rebased frame does not reset the note position')
  assert.deepEqual(paperReducer(next, { type: 'cancel', pointerId: 1 }).notes, next.notes)
})
