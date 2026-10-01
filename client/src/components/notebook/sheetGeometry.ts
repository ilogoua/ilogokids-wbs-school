export type SheetSize = { width: number; height: number }
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
