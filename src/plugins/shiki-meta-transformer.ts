import type { ShikiTransformer } from 'shiki';

/**
 * Parse meta string like `{wrap=true,lineno=true,hl_lines=["2-5","8"],linenostart=199}`
 * into a key-value object.
 */
function parseMeta(meta: string): Record<string, string | boolean | string[]> {
  const result: Record<string, string | boolean | string[]> = {};
  const match = meta.match(/\{([^}]+)\}/);
  if (!match) return result;

  const inner = match[1];
  const tokens: string[] = [];
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
      const items = val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      result[key] = items;
    } else {
      result[key] = val.replace(/^"|"$/g, '');
    }
  }

  return result;
}

/**
 * Expand range strings like "2-5" into a Set of line numbers.
 */
function expandRanges(ranges: string[]): Set<number> {
  const lines = new Set<number>();
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

export function shikiMetaTransformer(): ShikiTransformer {
  return {
    name: 'shiki-meta-transformer',

    // line hook runs BEFORE pre hook in Shiki, so we parse meta here (cached)
    line(node, line) {
      const raw = (this.options.meta as any)?.__raw as string | undefined;
      if (!raw) return;

      const meta = this.meta as any;
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
      const raw = (this.options.meta as any)?.__raw as string | undefined;
      if (!raw) return;

      const meta = this.meta as any;
      meta[metaSymbol] ??= parseMeta(raw);
      const parsed = meta[metaSymbol];

      if (parsed.wrap === true) {
        node.properties['data-wrap'] = '';
      }

      if (parsed.lineno === true) {
        node.properties['data-lineno'] = '';
        // Set counter-reset on <code> child to avoid CSS specificity issues
        const codeNode = node.children.find(
          (c: any) => c.type === 'element' && c.tagName === 'code'
        ) as any;
        if (codeNode) {
          const start = parsed.linenostart ? Number(parsed.linenostart) - 1 : 0;
          const existing = (codeNode.properties.style as string) || '';
          const sep = existing && !existing.endsWith(';') ? '; ' : '';
          codeNode.properties.style = existing + sep + `counter-reset: line ${start};`;
        }
      }
    },
  };
}
