export type SheetSize = { width: number; height: number }
// Flat-note layout rebasing only. Paper balls use physical frames in paperScreen.
export function rebaseSheetPoint(point: { x: number; y: number }, from: SheetSize, to: SheetSize, radius = 0) {
  const axis = (value: number, old: number, next: number) => radius + (value - radius) / Math.max(1, old - radius * 2) * Math.max(1, next - radius * 2)
  return { x: axis(point.x, from.width, to.width), y: axis(point.y, from.height, to.height) }
}
export type KeyboardOcclusion = { left: number; top: number; width: number; height: number; source: 'virtual-keyboard' | 'visual-viewport' | 'none' }

// Height-only changes on touch devices include keyboards and browser chrome.
// Only an actual orientation event or width change establishes a new sheet.
export function nextSheetSize(current: SheetSize, viewport: SheetSize, touch: boolean, editing: boolean, occluded: boolean, orientationChanged = false): SheetSize {
  if (orientationChanged || viewport.width !== current.width || (!touch && !editing && !occluded)) return viewport
  return current
}

export function viewportOcclusion(sheet: SheetSize, visibleBottom: number, editing: boolean): KeyboardOcclusion {
  const height = Math.max(0, sheet.height - visibleBottom)
  // Browser chrome and pinch zoom are not reliable keyboard measurements.
  return editing && height > sheet.height * 0.15
    ? { left: 0, top: sheet.height - height, width: sheet.width, height, source: 'visual-viewport' }
    : { left: 0, top: sheet.height, width: 0, height: 0, source: 'none' }
}
