"""Fast native check of lesson code (the browser e2e test is the real gate).

Runs every <PyCell> of the given lessons in order in one namespace:
  - plain cells must not raise;
  - exercise starter code must NOT pass its check; the solution MUST.

    python scripts/check_lessons.py [-v] [lesson-id ...]

Needs a Python env with the lesson packages (pandas, duckdb, polars, scikit-learn, ...).
"""
import ast, contextlib, io, json, os, re, sys, tempfile, time, traceback, warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src/lib/py"))
os.environ["MPLBACKEND"] = "AGG"

CELL = re.compile(r"<PyCell\b(.*?)/>", re.S)
ATTR = re.compile(r'(\w+)=(?:\{`((?:[^`\\]|\\.)*)`\}|"([^"]*)")', re.S)


def unescape(js: str) -> str:
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), js, flags=re.S)


def cells(path: Path):
    for m in CELL.finditer(path.read_text()):
        a = {k: (unescape(v1) if v1 else v2) for k, v1, v2 in ATTR.findall(m.group(1))}
        yield {k: v.strip("\n").rstrip() for k, v in a.items()}


def run(code: str, ns: dict, lang="python"):
    if lang == "sql":
        code = f"import duckdb\nresult = duckdb.sql({json.dumps(code)}).df()\nresult"
    tree = ast.parse(code)
    last = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = ast.Expression(tree.body.pop().value)
    exec(compile(tree, "<cell>", "exec"), ns)
    return eval(compile(last, "<cell>", "eval"), ns) if last else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    verbose = "-v" in sys.argv
    files = sorted((ROOT / "src/content/lessons").glob("*.mdx"))
    files = [f for f in files if not args or any(f.stem.startswith(a) for a in args)]
    failures = 0
    for f in files:
        ns = {"__name__": "__main__"}
        os.chdir(tempfile.mkdtemp())
        for i, c in enumerate(cells(f), 1):
            lang = c.get("lang", "python")
            buf = io.StringIO()
            t0 = time.time()

            def attempt(code, check=None):
                with contextlib.redirect_stdout(buf), warnings.catch_warnings():
                    warnings.simplefilter("default")
                    val = run(code, ns, lang)
                    if val is not None:
                        print(repr(val)[:1500])
                    if check:
                        run(check, ns)

            try:
                if "check" in c:
                    try:
                        attempt(c["code"], c["check"])
                    except Exception as e:
                        starter = f"{type(e).__name__}: {str(e)[:80]}"
                    else:
                        raise RuntimeError("starter code already passes the check")
                    if "solution" not in c:
                        raise RuntimeError("exercise has no solution")
                    buf = io.StringIO()
                    attempt(c["solution"], c["check"])
                    status = f"ok (starter fails with: {starter})"
                else:
                    attempt(c["code"])
                    status = "ok"
            except Exception:
                failures += 1
                status = "FAIL\n" + traceback.format_exc(limit=-3)
            print(f"{f.stem} cell {i:2d} [{time.time() - t0:5.2f}s] {status}")
            if verbose and buf.getvalue():
                print("    " + buf.getvalue().rstrip()[:1200].replace("\n", "\n    "))
        try:
            import matplotlib.pyplot as plt

            plt.close("all")
        except ImportError:
            pass
    sys.exit(1 if failures else 0)


main()
