/**
 * SVG Geometry Utilities
 * 
 * Mathematical functions for SVG geometry manipulations.
 * Includes Arc to Cubic Bezier conversion.
 */

/**
 * Converts an elliptical arc (A) to a sequence of cubic bezier curves (C).
 * 
 * @param x1 Start X
 * @param y1 Start Y
 * @param rx X radius
 * @param ry Y radius
 * @param angle X-axis rotation in degrees
 * @param largeArcFlag Large arc flag (0 or 1)
 * @param sweepFlag Sweep flag (0 or 1)
 * @param x2 End X
 * @param y2 End Y
 * @returns Array of numbers representing cubic bezier control points [cp1x, cp1y, cp2x, cp2y, x, y, ...]
 */
export function arcToCubic(
    x1: number, y1: number,
    rx: number, ry: number,
    angle: number,
    largeArcFlag: number,
    sweepFlag: number,
    x2: number, y2: number
): number[] {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const phi = toRad(angle);
    
    // Ensure radii are positive
    rx = Math.abs(rx);
    ry = Math.abs(ry);

    // If start and end are same, it's a zero length segment
    if (x1 === x2 && y1 === y2) {
        return [];
    }

    // Zero radii degenerate to a straight line
    if (rx === 0 || ry === 0) {
        return [x1, y1, x2, y2, x2, y2];
    }

    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    const x1p = cosPhi * (x1 - x2) / 2 + sinPhi * (y1 - y2) / 2;
    const y1p = -sinPhi * (x1 - x2) / 2 + cosPhi * (y1 - y2) / 2;

    // Check if radii are large enough
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const sqrtLambda = Math.sqrt(lambda);
        rx *= sqrtLambda;
        ry *= sqrtLambda;
    }

    // Center
    let factor = Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
    if (largeArcFlag === sweepFlag) factor = -factor;

    const cxp = factor * rx * y1p / ry;
    const cyp = factor * -ry * x1p / rx;

    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

    // Angles
    const getAngle = (ux: number, uy: number, vx: number, vy: number) => {
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
        let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)));
        if (ux * vy - uy * vx < 0) ang = -ang;
        return ang;
    };

    const theta1 = getAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dTheta = getAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

    if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

    const segments = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
    const delta = dTheta / segments;
    
    const curves: number[] = [];
    for (let i = 0; i < segments; i++) {
        const ang1 = theta1 + i * delta;
        const ang2 = theta1 + (i + 1) * delta;
        
        const cos1 = Math.cos(ang1);
        const sin1 = Math.sin(ang1);
        const cos2 = Math.cos(ang2);
        const sin2 = Math.sin(ang2);
        
        const p1x = cosPhi * rx * cos1 - sinPhi * ry * sin1 + cx;
        const p1y = sinPhi * rx * cos1 + cosPhi * ry * sin1 + cy;
        
        const p2x = cosPhi * rx * cos2 - sinPhi * ry * sin2 + cx;
        const p2y = sinPhi * rx * cos2 + cosPhi * ry * sin2 + cy;
        
        const k = 4 / 3 * Math.tan(delta / 4);
        
        const dx1 = -rx * sin1 * cosPhi - ry * cos1 * sinPhi;
        const dy1 = -rx * sin1 * sinPhi + ry * cos1 * cosPhi;
        
        const dx2 = -rx * sin2 * cosPhi - ry * cos2 * sinPhi;
        const dy2 = -rx * sin2 * sinPhi + ry * cos2 * cosPhi;
        
        curves.push(p1x + k * dx1);
        curves.push(p1y + k * dy1);
        curves.push(p2x - k * dx2);
        curves.push(p2y - k * dy2);
        curves.push(p2x);
        curves.push(p2y);
    }
    
    return curves;
}
