// Builds translated lessons from the English sources plus a translation file.
//
// Lesson code is single-sourced: only prose, hints, feedback messages and code
// comments are translated, so a translation can never drift from the code.
//
//   node scripts/i18n.mjs            generate src/content/lessons/<lang>/*.mdx (fails on missing translations)
//   node scripts/i18n.mjs extract <dir>   write the English segments (with keys) to <dir>, for translators
//
// Translation file format (i18n/<lang>/<lesson>.txt): blocks of
//   === <key>
//   translated text
// where <key> is the hash printed by `extract` for the English segment.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/content/lessons';
const LANGS = ['es'];
const CODE_ATTRS = ['code', 'check', 'solution'];

const key = (text) => createHash('sha1').update(text.trim()).digest('hex').slice(0, 8);

/** Split a lesson into parts and call tr(text, {optional}) for each translatable segment. */
function transform(source, tr) {
  const fm = source.match(/^---\n([\s\S]*?)\n---\n/);
  const front = fm[1].replace(/^(title|description|module): "(.*)"$/gm, (_, k, v) => `${k}: ${JSON.stringify(tr(v))}`);
  const body = source.slice(fm[0].length);

  const cell = (raw) =>
    raw
      .replace(/\b(hint|title)="([^"]*)"/g, (_, name, v) => `${name}="${tr(v)}"`)
      .replace(/(\w+)=\{`((?:[^`\\]|\\[\s\S])*)`\}/g, (m, name, code) => {
        if (!CODE_ATTRS.includes(name)) return m;
        const isSql = /lang="sql"/.test(raw) && name !== 'check';
        const lines = code.split('\n').map((line) => {
          const assert = line.match(/^(\s*(?:assert\b.*,\s*|raise AssertionError\())(f?)"((?:[^"\\]|\\.)*)"(\)?(?: from None)?\s*)$/);
          if (assert) return `${assert[1]}${assert[2]}"${tr(assert[3])}"${assert[4]}`;
          const comment = isSql ? line.match(/^(.*?)(--\s?)(\S.*)$/) : line.match(/^(|.*?\s)(#\s)(\S.*)$/);
          if (comment && /[a-zA-Z]{3}/.test(comment[3])) return `${comment[1]}${comment[2]}${tr(comment[3])}`;
          return line;
        });
        return `${name}={\`${lines.join('\n')}\`}`;
      });

  const prose = (text) => {
    const out = [];
    const lines = text.split('\n');
    let block = [];
    const flush = () => {
      if (!block.length) return;
      const t = block.join('\n');
      block = [];
      if (/^import /.test(t) || /^<\/?Lab>?$/.test(t.trim()) || !/[a-zA-Z]{2}/.test(t)) out.push(t);
      else if (/^<Lab /.test(t)) out.push(t.replace(/title="([^"]*)"/, (_, v) => `title="${tr(v)}"`));
      else out.push(tr(t));
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        flush();
        const fence = [line];
        while (++i < lines.length && !/^```/.test(lines[i])) fence.push(lines[i]);
        fence.push(lines[i] ?? '```');
        out.push(tr(fence.join('\n'), { optional: true }));
      } else if (line.trim() === '') {
        flush();
        out.push('');
      } else block.push(line);
    }
    flush();
    return out.join('\n');
  };

  let result = '';
  let last = 0;
  for (const m of body.matchAll(/<PyCell\b[\s\S]*?\/>/g)) {
    result += prose(body.slice(last, m.index)) + cell(m[0]);
    last = m.index + m[0].length;
  }
  result += prose(body.slice(last));
  // Lessons live one folder deeper, so component imports need one more "../".
  return `---\n${front}\n---\n${result}`.replace(/from '\.\.\/\.\.\/components\//g, "from '../../../components/");
}

function loadTranslations(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const chunk of readFileSync(file, 'utf8').split(/^=== /m).slice(1)) {
    const nl = chunk.indexOf('\n');
    map.set(chunk.slice(0, nl).trim(), chunk.slice(nl + 1).replace(/\n+$/, ''));
  }
  return map;
}

const lessons = readdirSync(SRC).filter((f) => f.endsWith('.mdx')).sort();
const [command, outDir] = process.argv.slice(2);

if (command === 'extract') {
  mkdirSync(outDir, { recursive: true });
  for (const f of lessons) {
    const seen = new Map();
    transform(readFileSync(join(SRC, f), 'utf8'), (text, opts = {}) => {
      if (!seen.has(key(text))) seen.set(key(text), (opts.optional ? '(optional) ' : '') + '\n' + text);
      return text;
    });
    writeFileSync(join(outDir, f.replace('.mdx', '.en.txt')), [...seen].map(([k, v]) => `=== ${k} ${v}`).join('\n') + '\n');
    console.log(f, seen.size, 'segments');
  }
} else {
  let problems = 0;
  for (const lang of LANGS) {
    const dir = join(SRC, lang);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const f of lessons) {
      const file = join('i18n', lang, f.replace('.mdx', '.txt'));
      const translations = loadTranslations(file);
      if (!translations.size) continue; // lesson not translated yet
      const used = new Set();
      const missing = [];
      const out = transform(readFileSync(join(SRC, f), 'utf8'), (text, opts = {}) => {
        const k = key(text);
        used.add(k);
        if (translations.has(k)) return translations.get(k);
        if (!opts.optional) missing.push(`=== ${k}\n${text}`);
        return text;
      });
      const unused = [...translations.keys()].filter((k) => !used.has(k));
      if (missing.length) console.error(`\n${file}: ${missing.length} segment(s) not translated:\n${missing.join('\n')}`);
      if (unused.length) console.error(`\n${file}: ${unused.length} translation(s) no longer match the English text: ${unused.join(', ')}`);
      problems += missing.length + unused.length;
      const note = `{/* Generated by scripts/i18n.mjs from ../${f} and ${file}. Do not edit. */}\n`;
      writeFileSync(join(dir, f), out.replace(/^(---\n[\s\S]*?\n---\n)/, `$1${note}`));
    }
  }
  if (problems) {
    console.error(`\ni18n: ${problems} problem(s). Run "node scripts/i18n.mjs extract <dir>" to see the English segments and their keys.`);
    process.exit(1);
  }
}
