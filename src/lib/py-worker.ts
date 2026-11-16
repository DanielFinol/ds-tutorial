/// <reference lib="webworker" />
// Runs Python (Pyodide) off the main thread. One worker per page = one shared
// namespace, so cells on a lesson page behave like notebook cells.

export const PYODIDE_VERSION = '314.0.8';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

type RunRequest = { id: number; code: string; check?: string };
export type RunResponse =
  | { id: number; type: 'status'; message: string }
  | {
      id: number;
      type: 'done';
      stdout: string;
      stderr: string;
      result: { text?: string; html?: string; error?: string } | null;
      images: string[];
      error: string | null;
      checkPassed: boolean | null;
    };

const HELPERS = `
import io, base64, sys, os, traceback, warnings
os.environ["MPLBACKEND"] = "AGG"
from pyodide.code import eval_code_async

def _ds_figures():
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import matplotlib.pyplot as plt
    out = []
    for n in plt.get_fignums():
        buf = io.BytesIO()
        with warnings.catch_warnings():  # internal backend noise, not the learner's concern
            warnings.simplefilter("ignore")
            plt.figure(n).savefig(buf, format="png", bbox_inches="tight", dpi=110)
        out.append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return out

def _ds_format_error(e):
    # Hide Pyodide/runner internals so learners only see frames from their own code.
    tb = traceback.TracebackException.from_exception(e)
    tb.stack = traceback.StackSummary.from_list(
        [f for f in tb.stack if "_pyodide" not in f.filename and f.name != "_ds_run"]
    )
    return "".join(tb.format())

async def _ds_run(src):
    try:
        val = await eval_code_async(src, globals())
    except Exception as e:
        return {"error": _ds_format_error(e)}
    if val is None:
        return None
    if hasattr(val, "_repr_html_"):
        try:
            html = val._repr_html_()
            if html:
                return {"html": html}
        except Exception:
            pass
    return {"text": repr(val)}
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodideReady: Promise<any> | null = null;

function getPyodide(post: (m: RunResponse) => void, id: number) {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      post({ id, type: 'status', message: 'Loading Python…' });
      const mod = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: PYODIDE_BASE });
      await py.runPythonAsync(HELPERS);
      return py;
    })();
  }
  return pyodideReady;
}

function cleanTraceback(msg: string): string {
  // Fallback for errors raised outside _ds_run (e.g. loading packages, checks).
  const lines = msg.split('\n');
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  return start > 0 ? ['Traceback (most recent call last):', ...lines.slice(start)].join('\n') : msg;
}

self.onmessage = async (ev: MessageEvent<RunRequest>) => {
  const { id, code, check } = ev.data;
  const post = (m: RunResponse) => self.postMessage(m);
  let stdout = '';
  let stderr = '';
  try {
    const py = await getPyodide(post, id);
    py.setStdout({ batched: (s: string) => (stdout += s + '\n') });
    py.setStderr({ batched: (s: string) => (stderr += s + '\n') });
    const toLoad = check ? `${code}\n${check}` : code;
    await py.loadPackagesFromImports(toLoad, {
      messageCallback: (m: string) => post({ id, type: 'status', message: m }),
    });
    post({ id, type: 'status', message: 'Running…' });

    const run = py.globals.get('_ds_run');
    const raw = await run(code);
    const result = raw ? raw.toJs({ dict_converter: Object.fromEntries }) : null;
    raw?.destroy?.();
    run.destroy();

    let checkPassed: boolean | null = null;
    if (result?.error) {
      post({ id, type: 'done', stdout, stderr, result: null, images: [], error: result.error, checkPassed: check ? false : null });
      return;
    }
    if (check) {
      try {
        await py.runPythonAsync(check);
        checkPassed = true;
      } catch (e) {
        checkPassed = false;
        const msg = String((e as Error).message ?? e);
        const assertion = msg.match(/AssertionError:?\s*(.*)$/m);
        stderr += `Not quite: ${assertion?.[1] || 'the check did not pass yet.'}\n`;
      }
    }

    const figs = py.globals.get('_ds_figures');
    const images = figs().toJs() as string[];
    figs.destroy();

    post({ id, type: 'done', stdout, stderr, result, images, error: null, checkPassed });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    post({ id, type: 'done', stdout, stderr, result: null, images: [], error: cleanTraceback(msg), checkPassed: check ? false : null });
  }
};
