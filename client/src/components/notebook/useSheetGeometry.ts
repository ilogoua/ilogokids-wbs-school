import { useLayoutEffect, useRef, useState } from 'react'
import { nextSheetSize, viewportOcclusion } from './sheetGeometry'
import type { KeyboardOcclusion } from './sheetGeometry'

type VirtualKeyboard = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect }
const viewportSize = () => ({ width: window.innerWidth, height: window.innerHeight })
const isEditing = () => !!document.activeElement?.matches('textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable=true]')

export function useSheetGeometry() {
  const [size, setSize] = useState(viewportSize)
  const sizeRef = useRef(size)
  const [keyboard, setKeyboard] = useState<KeyboardOcclusion>(() => viewportOcclusion(size, size.height, false))
  useLayoutEffect(() => {
    const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard
    let overlayEnabled = false
    const previousOverlay = vk?.overlaysContent
    try { if (vk) { vk.overlaysContent = true; overlayEnabled = vk.overlaysContent } } catch { /* Unsupported contexts use the frozen-sheet fallback. */ }
    const touch = navigator.maxTouchPoints > 0
    let editing = isEditing()
    let browserInset = Math.max(0, window.screen.height - sizeRef.current.height)
    let previousOccluded = false
    let orientationPending = false
    let frame = 0
    const update = () => {
      const viewport = viewportSize()
      const vv = window.visualViewport
      const rect = overlayEnabled ? vk?.boundingRect : undefined
      const fallback = viewportOcclusion(sizeRef.current, vv && vv.scale === 1 ? vv.offsetTop + vv.height : viewport.height, editing || isEditing() || previousOccluded)
      const occluded = !!rect?.height || fallback.height > 0
      const rotating = orientationPending || viewport.width !== sizeRef.current.width
      // On fallback browsers rotation can arrive with a still-open keyboard.
      // Preserve the last known browser-chrome inset instead of measuring that
      // keyboard-reduced height as the new physical landscape/portrait sheet.
      const candidate = touch && rotating && (occluded || previousOccluded)
        ? { ...viewport, height: Math.max(viewport.height, window.screen.height - browserInset) }
        : viewport
      const next = nextSheetSize(sizeRef.current, candidate, touch, editing || isEditing(), occluded || previousOccluded, orientationPending)
      if (!occluded && !previousOccluded && !editing && !isEditing()) browserInset = Math.max(0, window.screen.height - next.height)
      orientationPending = false
      sizeRef.current = next
      setSize(next)
      // Read-only keyboard occlusion; it never controls sheet or physics size.
      setKeyboard(rect?.height ? {
        left: Math.max(0, rect.x), top: Math.max(0, rect.y),
        width: Math.min(next.width, rect.width), height: Math.min(next.height - Math.max(0, rect.y), rect.height), source: 'virtual-keyboard',
      } : viewportOcclusion(next, vv && vv.scale === 1 ? vv.offsetTop + vv.height : viewport.height, editing || isEditing() || previousOccluded))
      previousOccluded = occluded
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    const focusIn = () => { editing = isEditing(); schedule() }
    const focusOut = () => { editing = false; schedule() }
    const orientation = () => {
      orientationPending = true
      schedule()
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule)
    window.screen.orientation?.addEventListener('change', orientation)
    window.addEventListener('orientationchange', orientation)
    document.addEventListener('focusin', focusIn)
    document.addEventListener('focusout', focusOut)
    vvListeners(true)
    function vvListeners(add: boolean) {
      for (const name of ['resize', 'scroll']) {
        if (add) window.visualViewport?.addEventListener(name, schedule)
        else window.visualViewport?.removeEventListener(name, schedule)
      }
    }
    vk?.addEventListener('geometrychange', schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
      window.screen.orientation?.removeEventListener('change', orientation)
      window.removeEventListener('orientationchange', orientation)
      document.removeEventListener('focusin', focusIn)
      document.removeEventListener('focusout', focusOut)
      vvListeners(false)
      vk?.removeEventListener('geometrychange', schedule)
      try { if (vk && previousOverlay !== undefined) vk.overlaysContent = previousOverlay } catch { /* Best-effort restoration. */ }
    }
  }, [])
  return { size, keyboard }
}
