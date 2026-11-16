/// <reference lib="webworker" />
// Runs Python (Pyodide) off the main thread. One worker per page = one shared
// namespace, so cells on a lesson page behave like notebook cells.
import dswSource from './py/dsw.py?raw';

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
      result: { text?: string; html?: string } | null;
      images: string[];
      error: string | null;
      checkPassed: boolean | null;
    };

const HELPERS = `
import io, base64, sys, os, traceback, warnings
os.environ["MPLBACKEND"] = "AGG"
from pyodide.code import eval_code_async

_ds_mpl_ready = False

def _ds_setup_matplotlib():
    global _ds_mpl_ready
    if _ds_mpl_ready or "matplotlib" not in sys.modules:
        return
    import matplotlib
    matplotlib.rcParams.update({
        "figure.figsize": (7, 3.6), "axes.spines.top": False, "axes.spines.right": False,
        "axes.grid": True, "grid.alpha": 0.25, "axes.titleweight": "bold", "axes.titlesize": 11,
        "axes.prop_cycle": matplotlib.cycler(color=["#1f6f5c", "#c26a2e", "#3b6ea8", "#8a5a9e", "#b0413e", "#6b7a2a"]),
    })
    _ds_mpl_ready = True

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

def _ds_display(val):
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

_ds_arrow_ready = False

def _ds_setup_pyarrow():
    # pandas' Parquet engine calls pyarrow.unregister_extension_type for a type that
    # this pyarrow build never registered; make that call tolerant.
    global _ds_arrow_ready
    import importlib.util
    if _ds_arrow_ready or importlib.util.find_spec("pyarrow") is None:
        return
    import pyarrow
    original = pyarrow.unregister_extension_type
    def unregister(name):
        try:
            original(name)
        except pyarrow.ArrowKeyError:
            pass
    pyarrow.unregister_extension_type = unregister
    _ds_arrow_ready = True

async def _ds_run(src):
    _ds_setup_pyarrow()
    try:
        val = await eval_code_async(src, globals())
    except Exception as e:
        return {"error": _ds_format_error(e)}
    _ds_setup_matplotlib()
    return _ds_display(val)

async def _ds_check(src):
    try:
        await eval_code_async(src, globals())
    except AssertionError as e:
        return str(e) or "the check did not pass yet."
    except Exception as e:
        return f"{type(e).__name__}: {e}"
    return None
`;

// Packages that code needs but that import scanning can't see.
const IMPLIED: [RegExp, string[]][] = [
  [/\bdsw\b/, ['numpy', 'pandas']],
  [/dsw\.export|parquet/, ['pyarrow']],
  [/register_duckdb/, ['duckdb']],
  [/\.plot\b|\.hist\(/, ['matplotlib']],
  [/smf\.|statsmodels/, ['statsmodels']],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodideReady: Promise<any> | null = null;

function getPyodide(post: (m: RunResponse) => void, id: number) {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      post({ id, type: 'status', message: 'Loading Python…' });
      const mod = await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: PYODIDE_BASE });
      const site = py.runPython('import site; site.getsitepackages()[0]');
      py.FS.writeFile(`${site}/dsw.py`, dswSource);
      await py.runPythonAsync(HELPERS);
      return py;
    })();
  }
  return pyodideReady;
}

self.onmessage = async (ev: MessageEvent<RunRequest>) => {
  const { id, code, check } = ev.data;
  const post = (m: RunResponse) => self.postMessage(m);
  let stdout = '';
  let stderr = '';
  const fail = (error: string) =>
    post({ id, type: 'done', stdout, stderr, result: null, images: [], error, checkPassed: check ? false : null });
  try {
    const py = await getPyodide(post, id);
    py.setStdout({ batched: (s: string) => (stdout += s + '\n') });
    py.setStderr({ batched: (s: string) => (stderr += s + '\n') });
    const all = check ? `${code}\n${check}` : code;
    const status = (m: string) => post({ id, type: 'status', message: m });
    const implied = IMPLIED.filter(([re]) => re.test(all)).flatMap(([, pkgs]) => pkgs);
    if (implied.length) await py.loadPackage([...new Set(implied)], { messageCallback: status });
    await py.loadPackagesFromImports(all, { messageCallback: status });
    status('Running…');

    const run = py.globals.get('_ds_run');
    const raw = await run(code);
    const result = raw ? raw.toJs({ dict_converter: Object.fromEntries }) : null;
    raw?.destroy?.();
    run.destroy();
    if (result?.error) return fail(result.error);

    let checkPassed: boolean | null = null;
    if (check) {
      const checker = py.globals.get('_ds_check');
      const problem: string | undefined = await checker(check);
      checker.destroy();
      checkPassed = !problem;
      if (problem) stderr += `Not quite: ${problem}\n`;
    }

    const figs = py.globals.get('_ds_figures');
    const images = figs().toJs() as string[];
    figs.destroy();

    post({ id, type: 'done', stdout, stderr, result, images, error: null, checkPassed });
  } catch (e) {
    fail(String((e as Error).message ?? e));
  }
};
