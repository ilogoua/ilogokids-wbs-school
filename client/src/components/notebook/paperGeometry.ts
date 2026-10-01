// offsetParent coordinates stay valid while the whole sheet turns in 3D.
export function sheetOffset(element: HTMLElement, sheet: HTMLElement) {
  let x = 0, y = 0
  for (let current: HTMLElement | null = element; current && current !== sheet; current = current.offsetParent as HTMLElement | null) {
    x += current.offsetLeft
    y += current.offsetTop
  }
  return { x, y }
}
