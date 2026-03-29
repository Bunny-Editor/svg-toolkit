/**
 * SVG Path Parser
 * 
 * Implements a robust tokenizer and parser for SVG path data (d attribute).
 * Follows the SVG 1.1/2.0 grammar specifications.
 * 
 * Handles:
 * - Implicit separators: negative signs and dots as number boundaries (10-5 → 10, -5)
 * - Scientific notation (1e-3, 2.5E+4)
 * - Arc flag compression (A25 26 0 0150-25 → flags parsed as single digits)
 * - Implicit command repetition (M 10 10 20 20 → M 10 10 L 20 20)
 * - All whitespace/comma variations
 */

export type CommandType = 'M' | 'L' | 'H' | 'V' | 'C' | 'S' | 'Q' | 'T' | 'A' | 'Z';

/** Base command with positional values array (backward compatible). */
export interface PathCommand {
    type: CommandType;
    relative: boolean;
    values: number[];
}

// ============================================
// Named-property command types
// ============================================

export interface MoveToCommand extends PathCommand { type: 'M'; x: number; y: number; }
export interface LineToCommand extends PathCommand { type: 'L'; x: number; y: number; }
export interface HLineToCommand extends PathCommand { type: 'H'; x: number; }
export interface VLineToCommand extends PathCommand { type: 'V'; y: number; }
export interface CurveToCommand extends PathCommand { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number; }
export interface SmoothCurveToCommand extends PathCommand { type: 'S'; x2: number; y2: number; x: number; y: number; }
export interface QuadCurveToCommand extends PathCommand { type: 'Q'; x1: number; y1: number; x: number; y: number; }
export interface SmoothQuadCurveToCommand extends PathCommand { type: 'T'; x: number; y: number; }
export interface ArcCommand extends PathCommand { type: 'A'; rx: number; ry: number; xAxisRotation: number; largeArc: boolean; sweep: boolean; x: number; y: number; }
export interface ClosePathCommand extends PathCommand { type: 'Z'; }

export type TypedPathCommand =
    | MoveToCommand | LineToCommand | HLineToCommand | VLineToCommand
    | CurveToCommand | SmoothCurveToCommand | QuadCurveToCommand | SmoothQuadCurveToCommand
    | ArcCommand | ClosePathCommand;

/**
 * Attaches named properties to a command based on its type.
 * The `values` array is always preserved for backward compatibility.
 */
function attachNamedProps(type: CommandType, relative: boolean, values: number[]): TypedPathCommand {
    const base = { type, relative, values };
    switch (type) {
        case 'M': return { ...base, type, x: values[0], y: values[1] } as MoveToCommand;
        case 'L': return { ...base, type, x: values[0], y: values[1] } as LineToCommand;
        case 'H': return { ...base, type, x: values[0] } as HLineToCommand;
        case 'V': return { ...base, type, y: values[0] } as VLineToCommand;
        case 'C': return { ...base, type, x1: values[0], y1: values[1], x2: values[2], y2: values[3], x: values[4], y: values[5] } as CurveToCommand;
        case 'S': return { ...base, type, x2: values[0], y2: values[1], x: values[2], y: values[3] } as SmoothCurveToCommand;
        case 'Q': return { ...base, type, x1: values[0], y1: values[1], x: values[2], y: values[3] } as QuadCurveToCommand;
        case 'T': return { ...base, type, x: values[0], y: values[1] } as SmoothQuadCurveToCommand;
        case 'A': return { ...base, type, rx: values[0], ry: values[1], xAxisRotation: values[2], largeArc: values[3] === 1, sweep: values[4] === 1, x: values[5], y: values[6] } as ArcCommand;
        case 'Z': return { ...base, type } as ClosePathCommand;
        default: return base as TypedPathCommand;
    }
}

/**
 * Tokenizes and parses SVG path data into a structured array of commands.
 */
export class SVGPathParser {
    private cursor = 0;
    private data = '';
    /** Parsing warnings (incomplete commands, truncated data, etc.) */
    public warnings: string[] = [];

    constructor(d: string) {
        this.data = d;
    }

    public parse(): TypedPathCommand[] {
        this.cursor = 0;
        this.warnings = [];
        const commands: TypedPathCommand[] = [];

        while (this.cursor < this.data.length) {
            this.skipWhitespace();
            if (this.cursor >= this.data.length) break;

            const char = this.data[this.cursor];
            
            if (/[MmLlHhVvCcSsQqTtAaZz]/.test(char)) {
                const type = char.toUpperCase() as CommandType;
                const relative = char !== type;
                const cmdPos = this.cursor;
                this.cursor++;
                
                const values: number[] = [];

                if (type === 'A') {
                    // Arc commands need special parsing because the 4th and 5th parameters
                    // (large-arc-flag and sweep-flag) are always 0 or 1, and per SVG spec
                    // they can be written without separators: "A25 26 0 0150-25" means
                    // rx=25 ry=26 rotation=0 large-arc=0 sweep=1 x=50 y=-25
                    this.parseArcValues(values);
                } else {
                    // Standard parameter parsing for non-arc commands
                    this.parseCommandValues(values);
                }

                // Handle implicit command repetition
                this.processCommand(commands, type, relative, values, cmdPos);
            } else {
                // Invalid character or garbage — skip and warn
                this.warnings.push(
                    `Unexpected character '${this.data[this.cursor]}' at position ${this.cursor}`
                );
                this.cursor++;
            }
        }

        return commands;
    }

    /**
     * Parses standard (non-arc) command values.
     * Numbers are naturally separated by whitespace, commas, or implicit boundaries
     * (sign characters and dots acting as separators).
     */
    private parseCommandValues(values: number[]) {
        while (true) {
            this.skipWhitespace();
            
            // Check for next command letter or end
            if (this.cursor >= this.data.length) break;
            if (/[MmLlHhVvCcSsQqTtAaZz]/.test(this.data[this.cursor])) break;
            
            const num = this.parseNumber();
            if (num !== null) {
                values.push(num);
            } else {
                break;
            }
        }
    }

    /**
     * Parses arc command values with special flag handling.
     * 
     * Arc parameters: (rx ry x-rotation large-arc-flag sweep-flag x y)+
     * 
     * The flags (params 4 and 5, 0-indexed as 3 and 4 within each 7-param group)
     * are always exactly 0 or 1 and must be consumed as single digits per SVG spec.
     * This allows compressed forms like "0150" to be parsed as flag=0, flag=1, x=50.
     */
    private parseArcValues(values: number[]) {
        while (true) {
            // Parse one complete arc parameter set (7 values)
            const startLen = values.length;

            for (let paramIdx = 0; paramIdx < 7; paramIdx++) {
                this.skipWhitespace();
                if (this.cursor >= this.data.length) return;
                if (/[MmLlHhVvCcSsQqTtAaZz]/.test(this.data[this.cursor])) return;

                if (paramIdx === 3 || paramIdx === 4) {
                    // Flag parameters: must be exactly '0' or '1' (single digit)
                    const flagChar = this.data[this.cursor];
                    if (flagChar === '0' || flagChar === '1') {
                        values.push(parseInt(flagChar));
                        this.cursor++;
                        // Skip optional trailing comma/whitespace AFTER the flag
                        this.skipOptionalComma();
                    } else {
                        // Invalid flag value — bail out of this arc set
                        return;
                    }
                } else {
                    // Normal numeric parameter
                    const num = this.parseNumber();
                    if (num !== null) {
                        values.push(num);
                    } else {
                        return;
                    }
                }
            }

            // If we didn't get a full set, stop
            if (values.length - startLen < 7) return;

            // Check if there are more arc parameter sets (implicit repetition)
            this.skipWhitespace();
            if (this.cursor >= this.data.length) return;
            if (/[MmLlHhVvCcSsQqTtAaZz]/.test(this.data[this.cursor])) return;
        }
    }

    /**
     * Skips an optional comma with optional surrounding whitespace.
     * Used after arc flags where a comma may or may not follow.
     */
    private skipOptionalComma() {
        this.skipWhitespace();
        if (this.cursor < this.data.length && this.data[this.cursor] === ',') {
            this.cursor++;
            this.skipWhitespace();
        }
    }

    private processCommand(commands: TypedPathCommand[], type: CommandType, relative: boolean, values: number[], cmdPos: number) {
        // Parameter counts for each command type
        const paramsCount: Record<string, number> = {
            'M': 2, 'L': 2, 'H': 1, 'V': 1,
            'C': 6, 'S': 4, 'Q': 4, 'T': 2,
            'A': 7, 'Z': 0
        };

        const count = paramsCount[type];
        
        if (type === 'Z') {
            commands.push({ type: 'Z', relative, values: [] } as ClosePathCommand);
            return;
        }

        // Warn if no values were parsed for a command that expects them
        if (count > 0 && values.length === 0) {
            this.warnings.push(
                `Empty ${type} command at position ${cmdPos} — expected ${count} values, got 0`
            );
            return;
        }

        // Group values into commands
        for (let i = 0; i < values.length; i += count) {
            // Ensure we have enough values for the command
            if (i + count <= values.length) {
                const args = values.slice(i, i + count);
                
                // Special case: MoveTo (M) with multiple pairs becomes LineTo (L) for subsequent pairs
                const cmdType = (type === 'M' && i > 0) ? 'L' as const : type;
                commands.push(attachNamedProps(cmdType, relative, args));
            } else {
                // Incomplete command — not enough values for the final group
                const remaining = values.length - i;
                this.warnings.push(
                    `Incomplete ${type} command at position ${cmdPos} — expected ${count} values, got ${remaining}`
                );
            }
        }
    }

    private skipWhitespace() {
        while (
            this.cursor < this.data.length && 
            /[\s,]/.test(this.data[this.cursor])
        ) {
            this.cursor++;
        }
    }

    /**
     * Parses a single number from the current cursor position.
     * 
     * Handles implicit separators per SVG spec:
     * - A sign (+/-) starts a new number even without whitespace: "10-5" → 10, -5
     * - A dot starts a new number if we already consumed a dot: "10.5.3" → 10.5, 0.3
     * - Scientific notation: "1e-3", "2.5E+4"
     */
    private parseNumber(): number | null {
        this.skipWhitespace();
        if (this.cursor >= this.data.length) return null;

        const start = this.cursor;
        let char = this.data[this.cursor];

        // Optional sign
        if (char === '+' || char === '-') {
            this.cursor++;
            if (this.cursor >= this.data.length) {
                this.cursor = start;
                return null;
            }
            char = this.data[this.cursor];
        }

        // Integer part
        let hasDigits = false;
        while (this.cursor < this.data.length && this.data[this.cursor] >= '0' && this.data[this.cursor] <= '9') {
            hasDigits = true;
            this.cursor++;
        }

        // Decimal part
        if (this.cursor < this.data.length && this.data[this.cursor] === '.') {
            this.cursor++;
            while (this.cursor < this.data.length && this.data[this.cursor] >= '0' && this.data[this.cursor] <= '9') {
                hasDigits = true;
                this.cursor++;
            }
        }

        // Exponent part (e.g., 1e-3, 2.5E+4)
        if (hasDigits && this.cursor < this.data.length && (this.data[this.cursor] === 'e' || this.data[this.cursor] === 'E')) {
            const saved = this.cursor;
            this.cursor++;
            if (this.cursor < this.data.length && (this.data[this.cursor] === '+' || this.data[this.cursor] === '-')) {
                this.cursor++;
            }
            let hasExpDigits = false;
            while (this.cursor < this.data.length && this.data[this.cursor] >= '0' && this.data[this.cursor] <= '9') {
                hasExpDigits = true;
                this.cursor++;
            }
            if (!hasExpDigits) {
                this.cursor = saved; // Backtrack if invalid exponent
            }
        }

        if (!hasDigits) {
            this.cursor = start;
            return null;
        }

        const numStr = this.data.slice(start, this.cursor);
        const num = parseFloat(numStr);
        return isNaN(num) ? null : num;
    }
}

export function parsePath(d: string): TypedPathCommand[] {
    if (!d) return [];
    return new SVGPathParser(d).parse();
}

/**
 * Parse path data and return both commands and any warnings.
 * Use this when you need diagnostic information about malformed paths.
 */
export function parsePathDetailed(d: string): { commands: TypedPathCommand[]; warnings: string[] } {
    const parser = new SVGPathParser(d);
    const commands = parser.parse();
    return { commands, warnings: parser.warnings };
}

// ============================================
// Serialization
// ============================================

/** Format a number for SVG path output: up to 4 decimal places, trailing zeros stripped. */
export function formatPathNumber(n: number): string {
    return parseFloat(n.toFixed(4)).toString();
}

/**
 * Serialize an array of PathCommands back into an SVG path data string.
 *
 * Produces clean output with absolute/relative commands preserved.
 * Handles all command types including arcs.
 */
export function serializeCommands(commands: PathCommand[]): string {
    return commands.map(cmd => {
        const letter = cmd.relative ? cmd.type.toLowerCase() : cmd.type;
        if (cmd.type === 'Z') return letter;
        return `${letter}${cmd.values.map(formatPathNumber).join(' ')}`;
    }).join(' ');
}

// ============================================
// Path Scaling
// ============================================

/**
 * Scale all coordinates in SVG path data by a uniform factor.
 *
 * Uses the robust parser internally — correctly handles every command type
 * including arcs (scales radii and endpoints, preserves flags and rotation).
 *
 * @param pathData  The SVG path `d` attribute string
 * @param scale     Uniform scale factor (e.g. 2 = double size)
 * @returns         Scaled path data string
 */
export function scalePath(pathData: string, scale: number): string {
    if (scale === 1) return pathData;

    const commands = parsePath(pathData);

    const scaled = commands.map(cmd => {
        if (cmd.type === 'Z') return cmd;

        const newValues = [...cmd.values];

        if (cmd.type === 'A') {
            // Arc: (rx ry rotation large-arc-flag sweep-flag x y)+
            // Scale rx, ry, x, y; leave rotation and flags untouched
            for (let i = 0; i < newValues.length; i += 7) {
                newValues[i]     *= scale; // rx
                newValues[i + 1] *= scale; // ry
                // [i+2] rotation — unchanged
                // [i+3] large-arc-flag — unchanged
                // [i+4] sweep-flag — unchanged
                newValues[i + 5] *= scale; // x
                newValues[i + 6] *= scale; // y
            }
        } else {
            // All other commands: scale every value (all are coordinates)
            for (let i = 0; i < newValues.length; i++) {
                newValues[i] *= scale;
            }
        }

        return { ...cmd, values: newValues };
    });

    return serializeCommands(scaled);
}
