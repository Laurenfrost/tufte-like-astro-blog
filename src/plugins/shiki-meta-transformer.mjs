// @ts-check

/**
 * Parse meta string like `{wrap=true,lineno=true,hl_lines=["2-5","8"],linenostart=199}`
 * into a key-value object.
 * @param {string} meta
 * @returns {Record<string, string | boolean | string[]>}
 */
function parseMeta(meta) {
  /** @type {Record<string, string | boolean | string[]>} */
  const result = {};
  const match = meta.match(/\{([^}]+)\}/);
  if (!match) return result;

  const inner = match[1];
  /** @type {string[]} */
  const tokens = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  for (const token of tokens) {
    const eqIdx = token.indexOf('=');
    if (eqIdx === -1) continue;
    const key = token.slice(0, eqIdx).trim();
    const val = token.slice(eqIdx + 1).trim();

    if (val === 'true') {
      result[key] = true;
    } else if (val === 'false') {
      result[key] = false;
    } else if (val.startsWith('[')) {
      result[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    } else {
      result[key] = val.replace(/^"|"$/g, '');
    }
  }

  return result;
}

/**
 * Expand range strings like "2-5" into a Set of line numbers.
 * @param {string[]} ranges
 */
function expandRanges(ranges) {
  /** @type {Set<number>} */
  const lines = new Set();
  for (const r of ranges) {
    if (r.includes('-')) {
      const [start, end] = r.split('-').map(Number);
      for (let i = start; i <= end; i++) lines.add(i);
    } else {
      lines.add(Number(r));
    }
  }
  return lines;
}

const metaSymbol = Symbol('shiki-meta-parsed');

/** @returns {import('shiki').ShikiTransformer} */
export function shikiMetaTransformer() {
  return {
    name: 'shiki-meta-transformer',

    // line hook runs BEFORE pre hook in Shiki, so we parse meta here (cached)
    line(node, line) {
      const raw = /** @type {any} */ (this.options.meta)?.__raw;
      if (!raw) return;

      const meta = /** @type {any} */ (this.meta);
      meta[metaSymbol] ??= parseMeta(raw);
      const parsed = meta[metaSymbol];

      if (parsed.hl_lines && Array.isArray(parsed.hl_lines)) {
        const lines = expandRanges(parsed.hl_lines);
        // hl_lines uses displayed line numbers (offset by linenostart)
        const offset = parsed.linenostart ? Number(parsed.linenostart) - 1 : 0;
        if (lines.has(line + offset)) {
          this.addClassToHast(node, 'highlighted');
        }
      }
    },

    // pre hook runs AFTER all line hooks — set data attributes and styles
    pre(node) {
      const raw = /** @type {any} */ (this.options.meta)?.__raw;
      if (!raw) return;

      const meta = /** @type {any} */ (this.meta);
      meta[metaSymbol] ??= parseMeta(raw);
      const parsed = meta[metaSymbol];

      if (parsed.wrap === true) {
        node.properties['data-wrap'] = '';
      }

      if (parsed.lineno === true) {
        node.properties['data-lineno'] = '';
        // Set counter-reset on <code> child to avoid CSS specificity issues
        const codeNode = /** @type {any} */ (
          node.children.find((c) => /** @type {any} */ (c).type === 'element' && /** @type {any} */ (c).tagName === 'code')
        );
        if (codeNode) {
          const start = parsed.linenostart ? Number(parsed.linenostart) - 1 : 0;
          const existing = codeNode.properties.style || '';
          const sep = existing && !existing.endsWith(';') ? '; ' : '';
          codeNode.properties.style = existing + sep + `counter-reset: line ${start};`;
        }
      }
    },
  };
}

export default shikiMetaTransformer;
