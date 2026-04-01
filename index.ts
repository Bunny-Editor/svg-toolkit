// Path parser
export {
  SVGPathParser,
  parsePath,
  parsePathDetailed,
  serializeCommands,
  scalePath,
  formatPathNumber,
} from './path-parser';

export type {
  CommandType,
  PathCommand,
  TypedPathCommand,
  MoveToCommand,
  LineToCommand,
  HLineToCommand,
  VLineToCommand,
  CurveToCommand,
  SmoothCurveToCommand,
  QuadCurveToCommand,
  SmoothQuadCurveToCommand,
  ArcCommand,
  ClosePathCommand,
} from './path-parser';

// Geometry
export { arcToCubic } from './geometry';

// Path points
export { pathToPoints, pointsToPath, pathPointsBounds } from './path-points';
export type { PathPoint, PointType } from './path-points';

// Style resolver
export { SVGStyleResolver } from './style-resolver';
