import test from 'node:test'
import assert from 'node:assert/strict'
import { nextSheetSize, viewportOcclusion } from '../src/components/notebook/sheetGeometry.ts'
const sheet = { width: 393, height: 852 }
test('keyboard changes report occlusion but preserve the identical sheet size', () => {
  const keyboard = viewportOcclusion(sheet, 400, true)
  assert.deepEqual(keyboard, { left: 0, top: 400, width: 393, height: 452, source: 'visual-viewport' })
  assert.equal(nextSheetSize(sheet, { width: 393, height: 400 }, true, true, true), sheet)
  assert.equal(nextSheetSize(sheet, { width: 393, height: 400 }, true, false, true), sheet)
  assert.equal(nextSheetSize(sheet, sheet, true, false, false), sheet)
  assert.equal(viewportOcclusion(sheet, 852, true).height, 0)
})
test('orientation remeasures while editing; desktop window resize is permitted', () => {
  const landscape = { width: 852, height: 393 }
  assert.deepEqual(nextSheetSize(sheet, landscape, true, true, true, true), landscape)
  assert.deepEqual(nextSheetSize(sheet, landscape, true, true, true), landscape)
  assert.deepEqual(nextSheetSize(sheet, { width: 393, height: 700 }, false, false, false), { width: 393, height: 700 })
})
test('browser chrome does not count as keyboard occlusion', () => {
  assert.equal(viewportOcclusion(sheet, 800, true).height, 0)
  assert.equal(viewportOcclusion(sheet, 400, false).height, 0)
  assert.equal(nextSheetSize(sheet, { width: 393, height: 800 }, true, false, false), sheet)
})

test('flat-note layout rebase is reversible and retains edge clearance', async () => {
  const { rebaseSheetPoint } = await import('../src/components/notebook/sheetGeometry.ts')
  const landscape = { width: 852, height: 393 }
  const bottom = { x: 100, y: sheet.height - 19 }
  const point = rebaseSheetPoint(bottom, sheet, landscape, 19)
  assert.equal(point.y, landscape.height - 19)
  const back = rebaseSheetPoint(point, landscape, sheet, 19)
  assert.ok(Math.abs(back.x - bottom.x) < 1e-6)
  assert.equal(back.y, bottom.y)
})
