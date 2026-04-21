export type Tool =
  | 'select'
  | 'pen'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'mosaic'
  | 'crop'

export interface BaseShape {
  id: string
  tool: Tool
  color: string
  strokeWidth: number
}

export interface PenShape extends BaseShape {
  tool: 'pen'
  points: number[] // x,y pairs
}

export interface LineShape extends BaseShape {
  tool: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RectShape extends BaseShape {
  tool: 'rect'
  x: number
  y: number
  width: number
  height: number
  fill?: string
}

export interface EllipseShape extends BaseShape {
  tool: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
  fill?: string
}

export interface TextShape extends BaseShape {
  tool: 'text'
  x: number
  y: number
  text: string
  fontSize: number
}

export interface MosaicShape extends BaseShape {
  tool: 'mosaic'
  x: number
  y: number
  width: number
  height: number
}

export type Shape = PenShape | LineShape | RectShape | EllipseShape | TextShape | MosaicShape
