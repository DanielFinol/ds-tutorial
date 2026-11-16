// <py-cell>: an editable, runnable Python (or SQL) cell backed by CodeMirror.
import { indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { setCompleted } from './progress';
import { runPython } from './py-client';

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--tok-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--tok-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--tok-number)' },
  { tag: [t.comment], color: 'var(--tok-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: 'var(--tok-def)' },
  { tag: [t.className, t.typeName], color: 'var(--tok-def)' },
]);

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--code-bg)', color: 'var(--text)', fontSize: '14px' },
  '.cm-content': { fontFamily: 'var(--mono)', padding: '10px 0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none', boxShadow: 'inset 0 0 0 2px var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection)' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' },
  '.cm-scroller': { overflowX: 'auto', lineHeight: '1.55' },
});

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: nothing persists, the page still works */
    }
  },
};

export class PyCellElement extends HTMLElement {
  view!: EditorView;
  hasRun = false;
  private running: Promise<boolean> | null = null;
  private initial = '';
  private key = '';

  connectedCallback() {
    if (this.view) return;
    this.initial = this.dataset.initial ?? '';
    this.key = `dsw:${location.pathname}:${hash(this.initial + (this.dataset.check ?? ''))}`;
    const host = this.querySelector<HTMLElement>('.cell-editor')!;
    host.replaceChildren();
    const isSql = this.dataset.lang === 'sql';
    let saveTimer = 0;
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: store.get(`${this.key}:code`) ?? this.initial,
        extensions: [
          Prec.highest(
            keymap.of([
              { key: 'Shift-Enter', run: () => (this.run(), true) },
              { key: 'Mod-Enter', run: () => (this.run(), true) },
            ]),
          ),
          basicSetup,
          keymap.of([indentWithTab]),
          indentUnit.of('    '),
          isSql ? sql() : python(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of({ 'aria-label': isSql ? 'SQL code' : 'Python code' }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => {
              const code = this.getCode();
              store.set(`${this.key}:code`, code === this.initial ? null : code);
            }, 400);
          }),
        ],
      }),
    });

    this.querySelector('[data-run]')!.addEventListener('click', () => this.run());
    this.querySelector('[data-reset]')!.addEventListener('click', () => {
      this.setCode(this.initial);
      store.set(`${this.key}:code`, null);
      this.out.hidden = true;
    });
    this.querySelector('[data-use-solution]')?.addEventListener('click', () => {
      this.setCode(this.dataset.solution ?? '');
      this.view.focus();
    });
    if (this.dataset.check && store.get(`${this.key}:passed`)) this.markPassed();
  }

  get out(): HTMLElement {
    return this.querySelector<HTMLElement>('.cell-out')!;
  }
  getCode(): string {
    return this.view.state.doc.toString();
  }
  setCode(code: string) {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: code } });
  }

  private markPassed() {
    this.classList.add('is-passed');
    const cells = [...document.querySelectorAll<PyCellElement>('py-cell[data-check]')];
    const lesson = document.body.dataset.lesson;
    if (lesson && cells.length && cells.every((c) => c.classList.contains('is-passed'))) {
      setCompleted(lesson, true);
      document.dispatchEvent(new CustomEvent('dsw:progress'));
    }
  }

  /** Python source for this cell (SQL cells are wrapped in a DuckDB call). */
  private source(): string {
    const code = this.getCode();
    if (this.dataset.lang !== 'sql') return code;
    return `import duckdb\nresult = duckdb.sql(${JSON.stringify(code)}).df()\nresult`;
  }

  /** Run this cell, first running any earlier cells on the page that haven't run yet. */
  run(opts: { auto?: boolean } = {}): Promise<boolean> {
    if (this.running) return this.running;
    this.running = this.execute(opts).finally(() => (this.running = null));
    return this.running;
  }

  private async execute({ auto = false }: { auto?: boolean }): Promise<boolean> {
    const runBtn = this.querySelector<HTMLButtonElement>('[data-run]')!;
    const out = this.out;
    runBtn.disabled = true;
    out.hidden = false;
    out.className = 'cell-out';
    const status = Object.assign(document.createElement('p'), { className: 'status', textContent: 'Starting…' });
    out.replaceChildren(status);

    if (!auto) {
      const all = [...document.querySelectorAll<PyCellElement>('py-cell')];
      for (const prev of all.slice(0, all.indexOf(this))) {
        if (prev.hasRun) continue;
        status.textContent = 'Running earlier cells first…';
        await prev.run({ auto: true });
      }
    }

    const check = this.dataset.check;
    const r = await runPython(this.source(), { check, onStatus: (s) => (status.textContent = s) });
    this.hasRun = true;
    out.replaceChildren();
    const pre = (text: string, cls: string) =>
      out.appendChild(Object.assign(document.createElement('pre'), { className: cls, textContent: text.trimEnd() }));
    if (r.stdout) pre(r.stdout, 'stdout');
    if (r.result?.html) {
      const div = document.createElement('div');
      div.className = 'html-result';
      div.innerHTML = r.result.html; // output of the learner's own code (e.g. a pandas table)
      out.appendChild(div);
    } else if (r.result?.text) pre(r.result.text, 'result');
    for (const b64 of r.images) {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${b64}`;
      img.alt = 'Plot produced by the code above';
      out.appendChild(img);
    }
    if (r.stderr) pre(r.stderr, 'stderr');
    if (r.error) {
      pre(r.error, 'error');
      const all = [...document.querySelectorAll<PyCellElement>('py-cell')];
      const unsolved = all.slice(0, all.indexOf(this)).some((c) => c.dataset.check && !c.classList.contains('is-passed'));
      if (unsolved) pre('Note: an earlier exercise on this page is not solved yet. Later cells build on it, so solve it first.', 'muted');
    }
    if (r.checkPassed === true) {
      out.classList.add('passed');
      pre('✓ Correct.', 'success');
      store.set(`${this.key}:passed`, '1');
      this.markPassed();
    }
    if (!out.childElementCount) pre('(no output)', 'muted');
    runBtn.disabled = false;
    return !r.error && r.checkPassed !== false;
  }
}

if (!customElements.get('py-cell')) customElements.define('py-cell', PyCellElement);
