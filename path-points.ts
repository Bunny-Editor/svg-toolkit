/**
 * SVG Path Points
 *
 * Resolved (absolute) representation of SVG path data as typed points.
 * Converts the raw PathCommand[] from the parser into an editable point array
 * where every coordinate is absolute and shorthand commands (H, V, S, T, A)
 * are expanded into their canonical forms (L, C, Q).
 *
 * This module provides:
 * - PathPoint interface: the resolved point type
 * - pathToPoints(): parse path string → absolute PathPoint[]
 * - pointsToPath(): serialize PathPoint[] → path string
 */

import { parsePath, CommandType, formatPathNumber } from './path-parser';
import { arcToCubic } from './geometry';

// Re-export CommandType so consumers don't need a separate import
export type PointType = CommandType;

export interface PathPoint {
    id: string;
    type: PointType;
    x: number;
    y: number;
    /** First control point (cubic and quadratic beziers) */
    cp1?: { x: number; y: number };
    /** Second control point (cubic beziers only) */
    cp2?: { x: number; y: number };
}

/**
 * Convert an SVG path data string into an array of resolved PathPoints.
 *
 * All coordinates are converted to absolute.
 * Shorthand commands are expanded:
 *   H, V → L  |  S → C  |  T → Q  |  A → C (via arc-to-cubic)
 *
 * Each point receives a sequential `point-N` id for stable identity.
 */
export function pathToPoints(d: string): PathPoint[] {
    if (!d || typeof d !== 'string') return [];

    const points: PathPoint[] = [];
    let pointCounter = 0;
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    const commands = parsePath(d);
    if (commands.length === 0) return [];

    for (const cmd of commands) {
        const { type, relative: isRelative, values: coords } = cmd;

        switch (type) {
            case 'M': {
                for (let i = 0; i + 1 < coords.length; i += 2) {
                    const x = isRelative ? currentX + coords[i] : coords[i];
                    const y = isRelative ? currentY + coords[i + 1] : coords[i + 1];
                    points.push({ id: `point-${pointCounter++}`, type: 'M', x, y });
                    currentX = x;
                    currentY = y;
                    if (i === 0) { startX = x; startY = y; }
                }
                break;
            }

            case 'L': {
                for (let i = 0; i + 1 < coords.length; i += 2) {
                    const x = isRelative ? currentX + coords[i] : coords[i];
                    const y = isRelative ? currentY + coords[i + 1] : coords[i + 1];
                    points.push({ id: `point-${pointCounter++}`, type: 'L', x, y });
                    currentX = x;
                    currentY = y;
                }
                break;
            }

            case 'H': {
                for (const coord of coords) {
                    const x = isRelative ? currentX + coord : coord;
                    points.push({ id: `point-${pointCounter++}`, type: 'L', x, y: currentY });
                    currentX = x;
                }
                break;
            }

            case 'V': {
                for (const coord of coords) {
                    const y = isRelative ? currentY + coord : coord;
                    points.push({ id: `point-${pointCounter++}`, type: 'L', x: currentX, y });
                    currentY = y;
                }
                break;
            }

            case 'C': {
                for (let i = 0; i + 5 < coords.length; i += 6) {
                    const cp1x = isRelative ? currentX + coords[i]     : coords[i];
                    const cp1y = isRelative ? currentY + coords[i + 1] : coords[i + 1];
                    const cp2x = isRelative ? currentX + coords[i + 2] : coords[i + 2];
                    const cp2y = isRelative ? currentY + coords[i + 3] : coords[i + 3];
                    const x    = isRelative ? currentX + coords[i + 4] : coords[i + 4];
                    const y    = isRelative ? currentY + coords[i + 5] : coords[i + 5];
                    points.push({
                        id: `point-${pointCounter++}`, type: 'C', x, y,
                        cp1: { x: cp1x, y: cp1y }, cp2: { x: cp2x, y: cp2y }
                    });
                    currentX = x;
                    currentY = y;
                }
                break;
            }

            case 'S': {
                for (let i = 0; i + 3 < coords.length; i += 4) {
                    const prev = points[points.length - 1];
                    let cp1x = currentX, cp1y = currentY;
                    if (prev?.type === 'C' && prev.cp2) {
                        cp1x = 2 * currentX - prev.cp2.x;
                        cp1y = 2 * currentY - prev.cp2.y;
                    }
                    const cp2x = isRelative ? currentX + coords[i]     : coords[i];
                    const cp2y = isRelative ? currentY + coords[i + 1] : coords[i + 1];
                    const x    = isRelative ? currentX + coords[i + 2] : coords[i + 2];
                    const y    = isRelative ? currentY + coords[i + 3] : coords[i + 3];
                    points.push({
                        id: `point-${pointCounter++}`, type: 'C', x, y,
                        cp1: { x: cp1x, y: cp1y }, cp2: { x: cp2x, y: cp2y }
                    });
                    currentX = x;
                    currentY = y;
                }
                break;
            }

            case 'Q': {
                for (let i = 0; i + 3 < coords.length; i += 4) {
                    const cp1x = isRelative ? currentX + coords[i]     : coords[i];
                    const cp1y = isRelative ? currentY + coords[i + 1] : coords[i + 1];
                    const x    = isRelative ? currentX + coords[i + 2] : coords[i + 2];
                    const y    = isRelative ? currentY + coords[i + 3] : coords[i + 3];
                    points.push({
                        id: `point-${pointCounter++}`, type: 'Q', x, y,
                        cp1: { x: cp1x, y: cp1y }
                    });
                    currentX = x;
                    currentY = y;
                }
                break;
            }

            case 'T': {
                for (let i = 0; i + 1 < coords.length; i += 2) {
                    const prev = points[points.length - 1];
                    let cp1x = currentX, cp1y = currentY;
                    if (prev?.type === 'Q' && prev.cp1) {
                        cp1x = 2 * currentX - prev.cp1.x;
                        cp1y = 2 * currentY - prev.cp1.y;
                    }
                    const x = isRelative ? currentX + coords[i] : coords[i];
                    const y = isRelative ? currentY + coords[i + 1] : coords[i + 1];
                    points.push({
                        id: `point-${pointCounter++}`, type: 'Q', x, y,
                        cp1: { x: cp1x, y: cp1y }
                    });
                    currentX = x;
                    currentY = y;
                }
                break;
            }

            case 'A': {
                for (let i = 0; i + 6 < coords.length; i += 7) {
                    const rx    = coords[i];
                    const ry    = coords[i + 1];
                    const rot   = coords[i + 2];
                    const large = coords[i + 3];
                    const sweep = coords[i + 4];
                    const x = isRelative ? currentX + coords[i + 5] : coords[i + 5];
                    const y = isRelative ? currentY + coords[i + 6] : coords[i + 6];

                    const curves = arcToCubic(currentX, currentY, rx, ry, rot, large, sweep, x, y);
                    for (let j = 0; j + 5 < curves.length; j += 6) {
                        points.push({
                            id: `point-${pointCounter++}`, type: 'C',
                            x: curves[j + 4], y: curves[j + 5],
                            cp1: { x: curves[j], y: curves[j + 1] },
                            cp2: { x: curves[j + 2], y: curves[j + 3] }
                        });
                    }
                    currentX = x;
                    currentY = y;
                }
                break;
            }

            case 'Z': {
                points.push({ id: `point-${pointCounter++}`, type: 'Z', x: startX, y: startY });
                currentX = startX;
                currentY = startY;
                break;
            }
        }
    }

    return points;
}

/**
 * Serialize an array of PathPoints back into an SVG path data string.
 * Outputs absolute M, L, C, Q, Z commands.
 */
export function pointsToPath(points: PathPoint[]): string {
    const fmt = formatPathNumber;
    const parts: string[] = [];

    for (const pt of points) {
        switch (pt.type) {
            case 'M':
                parts.push(`M ${fmt(pt.x)} ${fmt(pt.y)}`);
                break;
            case 'L':
                parts.push(`L ${fmt(pt.x)} ${fmt(pt.y)}`);
                break;
            case 'C':
                if (pt.cp1 && pt.cp2) {
                    parts.push(
                        `C ${fmt(pt.cp1.x)} ${fmt(pt.cp1.y)}, ${fmt(pt.cp2.x)} ${fmt(pt.cp2.y)}, ${fmt(pt.x)} ${fmt(pt.y)}`
                    );
                }
                break;
            case 'Q':
                if (pt.cp1) {
                    parts.push(
                        `Q ${fmt(pt.cp1.x)} ${fmt(pt.cp1.y)}, ${fmt(pt.x)} ${fmt(pt.y)}`
                    );
                }
                break;
            case 'Z':
                parts.push('Z');
                break;
        }
    }

    return parts.join(' ');
}

/**
 * Compute the tight axis-aligned bounding box for a PathPoint array.
 * Uses analytical cubic/quadratic extrema (dB/dt = 0) for exact bounds.
 */
export function pathPointsBounds(points: PathPoint[]): { x: number; y: number; width: number; height: number } {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };

    for (const p of points) expand(p.x, p.y);

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        if (curr.type === 'C' && curr.cp1 && curr.cp2) {
            const p0x = prev.x, p0y = prev.y;
            const p1x = curr.cp1.x, p1y = curr.cp1.y;
            const p2x = curr.cp2.x, p2y = curr.cp2.y;
            const p3x = curr.x, p3y = curr.y;
            for (const t of _cubicExtremaT(p0x, p1x, p2x, p3x)) {
                expand(_cubicAtT(p0x, p1x, p2x, p3x, t), _cubicAtT(p0y, p1y, p2y, p3y, t));
            }
            for (const t of _cubicExtremaT(p0y, p1y, p2y, p3y)) {
                expand(_cubicAtT(p0x, p1x, p2x, p3x, t), _cubicAtT(p0y, p1y, p2y, p3y, t));
            }
        } else if (curr.type === 'Q' && curr.cp1) {
            const p0x = prev.x, p0y = prev.y;
            const cpx = curr.cp1.x, cpy = curr.cp1.y;
            // Quadratic extrema: dB/dt = 0 → t = (p0 - cp) / (p0 - 2cp + p1)
            for (const [a, cp, b] of [[p0x, cpx, curr.x], [p0y, cpy, curr.y]] as [number, number, number][]) {
                const denom = a - 2 * cp + b;
                if (Math.abs(denom) > 1e-12) {
                    const t = (a - cp) / denom;
                    if (t > 0 && t < 1) {
                        const mt = 1 - t;
                        const val = mt * mt * a + 2 * mt * t * cp + t * t * b;
                        // Expand using the corresponding axis
                        if (a === p0x) expand(val, mt * mt * p0y + 2 * mt * t * cpy + t * t * curr.y);
                        else expand(mt * mt * p0x + 2 * mt * t * cpx + t * t * curr.x, val);
                    }
                }
            }
        }
    }

    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

function _cubicAtT(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function _cubicExtremaT(p0: number, p1: number, p2: number, p3: number): number[] {
    const a = -3 * p0 + 9 * p1 - 9 * p2 + 3 * p3;
    const b = 6 * p0 - 12 * p1 + 6 * p2;
    const c = -3 * p0 + 3 * p1;
    const roots: number[] = [];
    if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) > 1e-12) {
            const t = -c / b;
            if (t > 0 && t < 1) roots.push(t);
        }
    } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
            const sq = Math.sqrt(disc);
            const t1 = (-b + sq) / (2 * a);
            const t2 = (-b - sq) / (2 * a);
            if (t1 > 0 && t1 < 1) roots.push(t1);
            if (t2 > 0 && t2 < 1) roots.push(t2);
        }
    }
    return roots;
}
