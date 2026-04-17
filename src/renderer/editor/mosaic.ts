/**
 * Given an HTMLImageElement, produce a mosaic (pixelated) version as an
 * HTMLCanvasElement. The mosaic canvas has the same pixel dimensions as the
 * original and can be used as a clip source: draw the mosaic canvas only
 * within the union of mosaic-shape rectangles.
 */
export function makeMosaicCanvas(img: HTMLImageElement, blockSize = 12): HTMLCanvasElement {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.floor(w / blockSize))
  small.height = Math.max(1, Math.floor(h / blockSize))
  const sctx = small.getContext('2d')!
  sctx.imageSmoothingEnabled = false
  sctx.drawImage(img, 0, 0, small.width, small.height)

  const big = document.createElement('canvas')
  big.width = w
  big.height = h
  const bctx = big.getContext('2d')!
  bctx.imageSmoothingEnabled = false
  bctx.drawImage(small, 0, 0, w, h)

  return big
}
