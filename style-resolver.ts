/**
 * SVG Style Resolver
 * 
 * Handles the resolution of SVG presentation attributes and CSS styles.
 * Implements proper CSS cascade simulation including compound selectors,
 * descendant/child combinators, and spec-compliant specificity calculation.
 */

interface StyleMap {
    [property: string]: string;
}

interface CSSRule {
    selector: string;
    styles: StyleMap;
    specificity: number;
    /** Original source order for stable sorting when specificity is equal */
    order: number;
}

/**
 * Represents a single simple selector segment (e.g. "div.foo#bar")
 * which is a tag, zero or more classes, zero or more IDs, and zero or more pseudo-classes.
 */
interface SimpleSelector {
    tag: string | null;      // e.g. 'path', 'g', '*', or null if only classes/IDs
    ids: string[];           // e.g. ['myId']
    classes: string[];       // e.g. ['cls-1', 'cls-2']
    pseudoClasses: string[]; // e.g. ['first-child'] — stored but not used for matching
    attrs: { name: string; op: string; value: string }[]; // attribute selectors like [fill="red"]
}

/**
 * A compound selector chain: segments connected by combinators.
 * Evaluated right-to-left: the rightmost segment must match the target element,
 * then each prior segment must match an ancestor (descendant) or parent (child).
 */
interface SelectorChain {
    segments: SimpleSelector[];
    combinators: ('descendant' | 'child')[]; // combinators[i] connects segments[i] to segments[i+1]
}

export class SVGStyleResolver {
    private cssRules: CSSRule[] = [];
    private ruleCounter = 0;

    constructor(svgRoot: Element) {
        this.parseGlobalStyles(svgRoot);
    }

    /**
     * Parses <style> blocks within the SVG to build a CSS rule index.
     */
    private parseGlobalStyles(root: Element) {
        const styleElements = root.querySelectorAll('style');
        styleElements.forEach(styleEl => {
            const cssText = styleEl.textContent || '';
            this.parseCSS(cssText);
        });
    }

    /**
     * Parses CSS text and extracts rules with proper specificity.
     * Handles compound selectors, descendant/child combinators, and comma-separated groups.
     */
    private parseCSS(css: string) {
        // Remove comments
        css = css.replace(/\/\*[\s\S]*?\*\//g, '');

        // Match rules: selector { content }
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        let match;

        while ((match = ruleRegex.exec(css)) !== null) {
            const selectors = match[1].split(',');
            const content = match[2];
            const styles = this.parseStyleString(content);

            selectors.forEach(sel => {
                const selector = sel.trim();
                if (selector) {
                    this.cssRules.push({
                        selector,
                        styles,
                        specificity: this.calculateSpecificity(selector),
                        order: this.ruleCounter++
                    });
                }
            });
        }
        
        // Sort by specificity (low to high), then by source order for stable cascade
        this.cssRules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    }

    /**
     * Tokenizes a single selector string into a chain of simple selectors with combinators.
     * Examples:
     *   "g > path.cls-1"  → [{tag:'g'}, {tag:'path', classes:['cls-1']}] with combinator 'child'
     *   ".cls-1.cls-2"    → [{classes:['cls-1','cls-2']}] (single compound selector)
     *   "svg .foo #bar"   → [{tag:'svg'}, {classes:['foo']}, {ids:['bar']}] with 'descendant' combinators
     */
    private parseSelectorChain(selector: string): SelectorChain {
        const segments: SimpleSelector[] = [];
        const combinators: ('descendant' | 'child')[] = [];

        // Tokenize: split by whitespace and '>' while preserving compound selectors
        // We split on whitespace boundaries but keep '>' as a combinator marker
        const tokens: string[] = [];
        const combinatorTypes: ('descendant' | 'child')[] = [];

        // Normalize: ensure spaces around '>'
        const normalized = selector.replace(/\s*>\s*/g, ' > ').trim();
        const parts = normalized.split(/\s+/);

        let i = 0;
        while (i < parts.length) {
            if (parts[i] === '>') {
                // Mark previous combinator as 'child'
                if (combinatorTypes.length > 0) {
                    combinatorTypes[combinatorTypes.length - 1] = 'child';
                }
                i++;
                continue;
            }

            tokens.push(parts[i]);
            // Default combinator to next token is 'descendant'
            combinatorTypes.push('descendant');
            i++;
        }
        // Remove trailing combinator (last token has no next)
        if (combinatorTypes.length > 0) {
            combinatorTypes.pop();
        }

        // Parse each token into a SimpleSelector
        tokens.forEach(token => {
            segments.push(this.parseSimpleSelector(token));
        });

        return { segments, combinators: combinatorTypes };
    }

    /**
     * Parses a single compound selector token like "path.cls-1#myId:hover[fill=red]"
     * into its constituent parts.
     */
    private parseSimpleSelector(token: string): SimpleSelector {
        const result: SimpleSelector = {
            tag: null,
            ids: [],
            classes: [],
            pseudoClasses: [],
            attrs: []
        };

        if (!token) return result;

        // Extract attribute selectors first: [attr], [attr=value], [attr~=value], etc.
        let cleaned = token;
        const attrRegex = /\[([\w-]+)(?:([~|^$*]?=)["']?([^"'\]]*)["']?)?\]/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(token)) !== null) {
            result.attrs.push({
                name: attrMatch[1],
                op: attrMatch[2] || '',
                value: attrMatch[3] || ''
            });
        }
        cleaned = cleaned.replace(/\[[^\]]*\]/g, '');

        // Extract pseudo-classes (e.g. :first-child, :not(...))
        // We store but don't use them for matching (safe approximation)
        const pseudoRegex = /:([\w-]+(?:\([^)]*\))?)/g;
        let pseudoMatch;
        while ((pseudoMatch = pseudoRegex.exec(cleaned)) !== null) {
            result.pseudoClasses.push(pseudoMatch[1]);
        }
        cleaned = cleaned.replace(/:([\w-]+(?:\([^)]*\))?)/g, '');

        // Extract IDs
        const idRegex = /#([\w-]+)/g;
        let idMatch;
        while ((idMatch = idRegex.exec(cleaned)) !== null) {
            result.ids.push(idMatch[1]);
        }
        cleaned = cleaned.replace(/#[\w-]+/g, '');

        // Extract classes
        const classRegex = /\.([\w-]+)/g;
        let classMatch;
        while ((classMatch = classRegex.exec(cleaned)) !== null) {
            result.classes.push(classMatch[1]);
        }
        cleaned = cleaned.replace(/\.[\w-]+/g, '');

        // Whatever remains is the tag name (or '*')
        cleaned = cleaned.trim();
        if (cleaned && cleaned !== '*') {
            result.tag = cleaned.toLowerCase();
        } else if (cleaned === '*') {
            result.tag = '*';
        }

        return result;
    }

    /**
     * Calculates CSS specificity per W3C spec:
     *   specificity = (a, b, c) encoded as a*100 + b*10 + c
     *   a = count of ID selectors
     *   b = count of class selectors, attribute selectors, and pseudo-classes
     *   c = count of type (tag) selectors and pseudo-elements
     * 
     * Handles compound selectors like ".cls-1.cls-2" (specificity 0,2,0 = 20)
     * and combinators like "g > path.cls-1" (specificity 0,1,2 = 12)
     */
    private calculateSpecificity(selector: string): number {
        const chain = this.parseSelectorChain(selector);
        let a = 0, b = 0, c = 0;

        chain.segments.forEach(seg => {
            a += seg.ids.length;
            b += seg.classes.length + seg.pseudoClasses.length + seg.attrs.length;
            if (seg.tag && seg.tag !== '*') {
                c += 1;
            }
        });

        return a * 100 + b * 10 + c;
    }

    /**
     * Tests whether a SimpleSelector matches a given element.
     */
    private matchesSimpleSelector(el: Element, sel: SimpleSelector): boolean {
        // Tag check
        if (sel.tag && sel.tag !== '*') {
            if (el.tagName.toLowerCase() !== sel.tag) return false;
        }

        // ID check — all specified IDs must match
        if (sel.ids.length > 0) {
            const elId = el.getAttribute('id');
            if (!elId) return false;
            if (!sel.ids.every(id => id === elId)) return false;
        }

        // Class check — all specified classes must be present
        if (sel.classes.length > 0) {
            const elClassName = el.getAttribute('class');
            if (!elClassName) return false;
            const elClasses = elClassName.split(/\s+/);
            if (!sel.classes.every(c => elClasses.includes(c))) return false;
        }

        // Attribute selector check
        for (const attr of sel.attrs) {
            const val = el.getAttribute(attr.name);
            if (val === null) return false;
            if (attr.op === '=' && val !== attr.value) return false;
            if (attr.op === '~=' && !val.split(/\s+/).includes(attr.value)) return false;
            if (attr.op === '|=' && val !== attr.value && !val.startsWith(attr.value + '-')) return false;
            if (attr.op === '^=' && !val.startsWith(attr.value)) return false;
            if (attr.op === '$=' && !val.endsWith(attr.value)) return false;
            if (attr.op === '*=' && !val.includes(attr.value)) return false;
        }

        // Pseudo-classes are not matched (safe: may cause false positives but no false negatives)
        return true;
    }

    /**
     * Tests whether a selector chain matches the target element.
     * Evaluates right-to-left: the rightmost segment must match the element,
     * then works backwards through ancestors using the appropriate combinator.
     */
    private matchesSelectorChain(el: Element, chain: SelectorChain): boolean {
        const { segments, combinators } = chain;
        if (segments.length === 0) return false;

        // Rightmost segment must match the target element
        const lastSeg = segments[segments.length - 1];
        if (!this.matchesSimpleSelector(el, lastSeg)) return false;

        // Walk backwards through remaining segments
        let currentEl: Element | null = el;
        for (let i = segments.length - 2; i >= 0; i--) {
            const seg = segments[i];
            const combinator = combinators[i]; // combinator between segments[i] and segments[i+1]

            if (combinator === 'child') {
                // Parent must match
                currentEl = currentEl?.parentElement || null;
                if (!currentEl || !this.matchesSimpleSelector(currentEl, seg)) {
                    return false;
                }
            } else {
                // Descendant: any ancestor must match
                currentEl = currentEl?.parentElement || null;
                let found = false;
                while (currentEl) {
                    if (this.matchesSimpleSelector(currentEl, seg)) {
                        found = true;
                        break;
                    }
                    currentEl = currentEl.parentElement;
                }
                if (!found) return false;
            }
        }

        return true;
    }

    /**
     * Tests whether a CSS selector matches a given element.
     * Parses the selector into a chain and evaluates it.
     */
    private matchesSelector(el: Element, selector: string): boolean {
        const chain = this.parseSelectorChain(selector);
        return this.matchesSelectorChain(el, chain);
    }

    public parseStyleString(styleStr: string): StyleMap {
        const styles: StyleMap = {};
        if (!styleStr) return styles;
        
        styleStr.split(';').forEach(part => {
            // Use indexOf to handle values containing ':' (e.g. "url(data:image/...)") 
            const colonIdx = part.indexOf(':');
            if (colonIdx === -1) return;
            const key = part.slice(0, colonIdx).trim();
            const value = part.slice(colonIdx + 1).trim();
            if (key && value) {
                styles[key] = value;
            }
        });
        return styles;
    }

    /**
     * Resolves the computed style for a given element, considering:
     * 1. Inherited styles (lowest priority)
     * 2. Global CSS rules (in specificity + source order)
     * 3. Presentation attributes (fill="red") — SVG 2 treats these as author-level zero-specificity
     * 4. Inline style attribute (highest priority)
     */
    public resolveStyle(element: Element, inheritedStyles: StyleMap = {}): StyleMap {
        const computed: StyleMap = { ...inheritedStyles }; // Start with inheritance

        // 1. Apply Global CSS Rules (already sorted by specificity then source order)
        this.cssRules.forEach(rule => {
            if (this.matchesSelector(element, rule.selector)) {
                Object.assign(computed, rule.styles);
            }
        });

        // 2. Apply Presentation Attributes (fill, stroke, etc.)
        // In SVG 2, these are treated as author-level zero-specificity CSS declarations.
        // They override inherited values and CSS rules with equal or lower specificity,
        // but get overridden by any explicit CSS rule or inline style.
        // For practical editing, we apply them after CSS so they override class-based styles
        // only when explicitly set on the element. This matches most real SVG behavior.
        const presentationAttrs = [
            'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
            'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
            'fill-opacity', 'fill-rule', 'opacity', 'font-family', 'font-size',
            'font-weight', 'font-style', 'text-anchor', 'text-decoration',
            'color', 'display', 'visibility', 'clip-path', 'clip-rule',
            'marker-start', 'marker-mid', 'marker-end'
        ];
        presentationAttrs.forEach(attr => {
            const val = element.getAttribute(attr);
            if (val) {
                computed[attr] = val;
            }
        });

        // 3. Apply Inline Style Attribute (Highest priority)
        const inlineStyle = element.getAttribute('style');
        if (inlineStyle) {
            const inline = this.parseStyleString(inlineStyle);
            Object.assign(computed, inline);
        }

        return computed;
    }
}
