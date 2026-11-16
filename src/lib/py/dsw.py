"""dsw: the practice data for "Data Science at Work".

Everything here describes Bramble, a fictional online home-goods retailer with a
paid membership ("Bramble Plus"). Tables are generated deterministically, so
every learner sees exactly the same numbers.

    import dsw
    dsw.tables()                    # what's available
    orders = dsw.load("orders")     # a fresh copy of one table
    dsw.export("data")              # write CSV/Parquet files to ./data
    dsw.register_duckdb()           # expose all tables to duckdb.sql(...)
"""

from __future__ import annotations

import io
import json
import os
import re
from functools import lru_cache

import numpy as np
import pandas as pd

pd.set_option("display.max_columns", 40)
pd.set_option("display.width", 160)

START = pd.Timestamp("2023-01-01")
END = pd.Timestamp("2024-12-31")
_DAYS = (END - START).days + 1

_DESCRIPTIONS = {
    "customers": "One row per registered customer.",
    "products": "The product catalogue: category, list price, unit cost.",
    "orders": "One row per order: who, when, status, total.",
    "order_items": "One row per product per order: quantity and price paid.",
    "tickets": "Customer-support tickets with free text, category and CSAT.",
    "ab_checkout": "A/B test of a one-page checkout: one row per user.",
    "ab_shipping": "A/B test of a free-shipping banner: one row per user.",
    "daily_demand": "Units sold per day for three categories, 2022-2024.",
}


# --------------------------------------------------------------------------- customers
@lru_cache(maxsize=None)
def _customers_full() -> pd.DataFrame:
    rng = np.random.default_rng(11)
    n = 12000
    signup_day = np.sort(np.floor(rng.beta(1.25, 1.0, n) * _DAYS).astype(int))
    country = rng.choice(["US", "UK", "DE", "FR", "CA"], n, p=[0.55, 0.20, 0.12, 0.08, 0.05])
    channel = rng.choice(
        ["organic", "paid_search", "social", "referral", "email"], n, p=[0.35, 0.25, 0.15, 0.15, 0.10]
    )
    device = rng.choice(["mobile", "desktop", "tablet"], n, p=[0.60, 0.33, 0.07])
    age = rng.normal(38, 11, n).round().clip(18, 79)
    age[rng.random(n) < 0.04] = np.nan
    plus_p = pd.Series(channel).map({"referral": 0.30, "email": 0.25}).fillna(0.16).to_numpy()
    plus = rng.random(n) < plus_p
    bad = rng.random(n) < 0.18  # hidden: had a bad experience
    deal = rng.random(n) < np.where(np.isin(channel, ["paid_search", "social"]), 0.35, 0.12)  # hidden: only buys on discount

    life_mult = pd.Series(channel).map(
        {"organic": 1.15, "paid_search": 0.75, "social": 0.70, "referral": 1.20, "email": 1.00}
    ).to_numpy()
    # Bad experiences hurt non-members far more than members; deal-seekers leave quickly.
    mean_life = (
        420 * life_mult * np.where(plus, 1.6, 1.0) * np.where(bad, np.where(plus, 0.75, 0.30), 1.0) * np.where(deal, 0.45, 1.0)
    )
    lifetime = rng.exponential(mean_life)
    rate = rng.gamma(2.5, 0.36, n) * np.where(plus, 1.4, 1.0) * np.where(device == "desktop", 1.1, 1.0)

    return pd.DataFrame(
        {
            "customer_id": np.arange(1, n + 1),
            "signup_date": START + pd.to_timedelta(signup_day, unit="D"),
            "country": country,
            "channel": channel,
            "device": device,
            "age": age,
            "plus_member": plus,
            "_signup_day": signup_day,
            "_bad": bad,
            "_deal": deal,
            "_active_days": np.minimum(lifetime, _DAYS - signup_day),
            "_rate": rate,
        }
    )


def _customers() -> pd.DataFrame:
    return _customers_full().loc[:, lambda d: [c for c in d.columns if not c.startswith("_")]]


# --------------------------------------------------------------------------- products
_CATALOGUE = {
    "Kitchen": (28, ["Chef's Knife", "Cutting Board", "Dutch Oven", "Mixing Bowl Set", "Pour-Over Kettle",
                     "Spice Rack", "Salad Spinner", "Baking Sheet", "Cast-Iron Skillet", "Utensil Crock",
                     "Tea Towel Set", "Measuring Cups"]),
    "Bedding": (65, ["Linen Duvet Cover", "Down Pillow", "Fitted Sheet", "Wool Blanket", "Quilt",
                     "Mattress Topper", "Pillowcase Pair", "Weighted Blanket", "Bed Skirt", "Throw",
                     "Flannel Sheet Set", "Bolster"]),
    "Bath": (22, ["Bath Towel", "Bath Mat", "Soap Dispenser", "Shower Curtain", "Robe", "Hand Towel Pair",
                  "Toothbrush Holder", "Shower Caddy", "Washcloth Set", "Laundry Hamper", "Bath Tray",
                  "Tissue Box Cover"]),
    "Decor": (35, ["Ceramic Vase", "Picture Frame", "Wall Mirror", "Candle Holder", "Throw Pillow",
                   "Area Rug", "Wall Clock", "Bookends", "Planter", "Woven Basket", "Table Runner",
                   "Scented Candle"]),
    "Lighting": (55, ["Table Lamp", "Floor Lamp", "Pendant Light", "Desk Lamp", "String Lights",
                      "Wall Sconce", "Lampshade", "Night Light", "Lantern", "Smart Bulb Pack",
                      "Reading Light", "Candle Lantern"]),
    "Storage": (30, ["Storage Bin", "Shoe Rack", "Drawer Organizer", "Coat Rack", "Shelf Unit",
                     "Under-Bed Box", "Wall Hooks", "Jar Set", "Magazine File", "Closet Organizer",
                     "Key Tray", "Stacking Crate"]),
    "Outdoor": (80, ["Patio Chair", "Fire Pit", "Outdoor Rug", "Hammock", "Garden Planter",
                     "Picnic Blanket", "Patio Umbrella", "Solar Lantern", "Bistro Table", "Doormat",
                     "Bird Feeder", "Garden Tool Set"]),
    "Kids": (25, ["Toy Bin", "Step Stool", "Night Lamp", "Play Mat", "Growth Chart", "Book Ledge",
                  "Hooded Towel", "Lunch Box", "Bean Bag", "Mobile", "Storage Cubby", "Kids' Table"]),
}


@lru_cache(maxsize=None)
def _products() -> pd.DataFrame:
    rng = np.random.default_rng(13)
    rows = []
    pid = 1
    for category, (median, names) in _CATALOGUE.items():
        for name in names:
            price = np.floor(median * rng.lognormal(0, 0.45)) + 0.99
            rows.append(
                {
                    "product_id": pid,
                    "name": name,
                    "category": category,
                    "price": round(float(price), 2),
                    "unit_cost": round(float(price * rng.uniform(0.35, 0.65)), 2),
                }
            )
            pid += 1
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- orders
@lru_cache(maxsize=None)
def _orders_and_items() -> tuple[pd.DataFrame, pd.DataFrame]:
    c = _customers_full()
    p = _products()
    rng = np.random.default_rng(12)

    n_orders = rng.poisson(c["_rate"] * c["_active_days"] / 30) + (rng.random(len(c)) < 0.8)
    idx = np.repeat(np.arange(len(c)), np.asarray(n_orders, dtype=np.intp))
    day = c["_signup_day"].to_numpy()[idx] + rng.random(len(idx)) * c["_active_days"].to_numpy()[idx]
    day = np.minimum(np.floor(day).astype(int), _DAYS - 1)
    date = START + pd.to_timedelta(day, unit="D")

    # Seasonality by thinning: busier weekends and a November-December peak.
    dow_w = np.array([0.82, 0.78, 0.80, 0.84, 0.90, 0.97, 1.00])[date.dayofweek]
    month_w = np.where(date.month.isin([11, 12]), 1.0, 0.72)
    keep = rng.random(len(idx)) < dow_w * month_w
    idx, date = idx[keep], date[keep]
    m = len(idx)

    hour = rng.choice(24, m, p=np.array([1, 1, 1, 1, 1, 2, 3, 4, 5, 5, 5, 6, 6, 5, 5, 5, 5, 6, 7, 8, 8, 6, 3, 1]) / 100)
    ts = date + pd.to_timedelta(hour * 3600 + rng.integers(0, 3600, m), unit="s")
    order = np.argsort(ts.to_numpy(), kind="stable")
    idx, ts = idx[order], ts[order]

    bad = c["_bad"].to_numpy()[idx]
    plus = c["plus_member"].to_numpy()[idx]
    u = rng.random(m)
    status = np.where(u < 0.05, "cancelled", np.where(u < 0.05 + np.where(bad, 0.16, 0.03), "refunded", "completed"))
    cust_device = c["device"].to_numpy()[idx]
    device = np.where(rng.random(m) < 0.85, cust_device, rng.choice(["mobile", "desktop", "tablet"], m, p=[0.6, 0.33, 0.07]))
    black_friday = (ts.month == 11) & (ts.day >= 20)
    deal = c["_deal"].to_numpy()[idx]
    discount = np.where(
        black_friday | deal,
        rng.choice([0, 10, 20, 30], m, p=[0.20, 0.22, 0.32, 0.26]),
        rng.choice([0, 10, 20, 30], m, p=[0.80, 0.11, 0.06, 0.03]),
    )
    order_id = 100001 + np.arange(m)

    # Items
    n_items = np.minimum(1 + rng.poisson(1.1, m), 6)
    o_idx = np.repeat(np.arange(m), np.asarray(n_items, dtype=np.intp))
    pop = 1 / (1 + np.arange(len(p))) ** 0.7
    pop = rng.permutation(pop / pop.sum())
    prod = rng.choice(len(p), len(o_idx), p=pop)
    items = pd.DataFrame(
        {
            "order_id": order_id[o_idx],
            "product_id": p["product_id"].to_numpy()[prod],
            "quantity": rng.choice([1, 2, 3, 4], len(o_idx), p=[0.72, 0.20, 0.06, 0.02]),
            "unit_price": (p["price"].to_numpy()[prod] * (1 - discount[o_idx] / 100)).round(2),
        }
    ).drop_duplicates(["order_id", "product_id"], ignore_index=True)

    subtotal = (items["quantity"] * items["unit_price"]).groupby(items["order_id"]).sum().reindex(order_id).to_numpy()
    shipping = np.where(plus | (subtotal >= 75), 0.0, 4.99)
    orders = pd.DataFrame(
        {
            "order_id": order_id,
            "customer_id": c["customer_id"].to_numpy()[idx],
            "order_ts": ts,
            "status": status,
            "device": device,
            "discount_pct": discount,
            "shipping_fee": shipping,
            "total": (subtotal + shipping).round(2),
        }
    )
    return orders, items


# --------------------------------------------------------------------------- tickets
_TICKET_TEMPLATES = {
    "shipping_delay": [
        "My order #{o} was supposed to arrive {d} days ago and the tracking hasn't updated. Where is it?",
        "Still waiting on order #{o}. It's now {d} days late. Can you tell me when it will ship?",
        "Tracking for #{o} says 'label created' for over a week. This is taking far too long.",
        "hi, the {p} I ordered ({o}) hasn't shown up, it's been {d} days past the delivery date",
        "Order {o} is late. I needed the {p} for this weekend. Please expedite or tell me what's going on.",
    ],
    "damaged_item": [
        "The {p} from order #{o} arrived broken. The box was crushed on one side.",
        "Received my {p} today and it's cracked. I'd like a replacement sent out.",
        "Order #{o}: the {p} has a large scratch and a dent. Photos attached.",
        "my {p} came with a piece missing and a tear in the packaging, not usable",
        "Opened the parcel and the {p} was shattered. Very disappointed with the packing.",
    ],
    "refund_request": [
        "I returned the {p} from order #{o} {d} days ago and still haven't received my refund of ${a}.",
        "Please refund order #{o}. I no longer need the {p}.",
        "I'd like my money back for the {p}. It isn't what I expected. Order {o}.",
        "Requesting a refund of ${a} for order #{o}. I sent the item back last week.",
        "can I get a refund on {o}? the {p} doesn't fit my space",
    ],
    "billing": [
        "I was charged twice for order #{o}. Please reverse one of the ${a} charges.",
        "My card shows ${a} but the order confirmation for #{o} says a different amount.",
        "Why was I charged for Bramble Plus this month? I cancelled the membership already.",
        "The discount code didn't apply to order #{o}; I was charged full price (${a}).",
        "There's a ${a} charge from Bramble I don't recognise. Can you explain what it's for?",
    ],
    "product_question": [
        "Is the {p} machine washable? The product page doesn't say.",
        "What are the exact dimensions of the {p}? I need to know if it fits a 60cm shelf.",
        "Does the {p} come in other colours, and when will it be back in stock?",
        "Hi, is the {p} suitable for outdoor use in the rain?",
        "Can you tell me what material the {p} is made from? I have allergies.",
    ],
    "account": [
        "I can't log in. The password reset email never arrives.",
        "How do I change the delivery address on my account?",
        "Please update my email address; I no longer use the old one.",
        "I want to delete my account and all my data.",
        "How do I cancel my Bramble Plus membership?",
    ],
}
TICKET_CATEGORIES = list(_TICKET_TEMPLATES)
_NEGATIVE = ["shipping_delay", "damaged_item", "refund_request"]


@lru_cache(maxsize=None)
def _tickets() -> pd.DataFrame:
    c = _customers_full()
    p = _products()
    rng = np.random.default_rng(14)
    rate = np.where(c["_bad"], 0.30, 0.04)
    n_t = rng.poisson(rate * c["_active_days"] / 30)
    idx = np.repeat(np.arange(len(c)), np.asarray(n_t, dtype=np.intp))
    m = len(idx)
    day = c["_signup_day"].to_numpy()[idx] + rng.random(m) * c["_active_days"].to_numpy()[idx]
    ts = START + pd.to_timedelta(np.minimum(day, _DAYS - 0.01) * 86400, unit="s").floor("s")
    bad = c["_bad"].to_numpy()[idx]
    cat_bad = rng.choice(TICKET_CATEGORIES, m, p=[0.35, 0.30, 0.20, 0.05, 0.05, 0.05])
    cat_ok = rng.choice(TICKET_CATEGORIES, m, p=[0.20, 0.08, 0.07, 0.15, 0.30, 0.20])
    category = np.where(bad, cat_bad, cat_ok)

    names = p["name"].to_numpy()
    texts = []
    for cat in category:
        t = _TICKET_TEMPLATES[cat][rng.integers(5)]
        texts.append(
            t.format(
                o=100001 + int(rng.integers(30000)),
                d=int(rng.integers(2, 15)),
                p=str(names[rng.integers(len(names))]).lower(),
                a=f"{rng.uniform(12, 240):.2f}",
            )
        )
    negative = np.isin(category, _NEGATIVE)
    csat = np.clip(np.round(rng.normal(np.where(negative, 2.3, 4.1), 1.0)), 1, 5)
    csat[rng.random(m) < 0.45] = np.nan
    out = pd.DataFrame(
        {
            "customer_id": c["customer_id"].to_numpy()[idx],
            "created_ts": ts,
            "channel": rng.choice(["email", "chat", "phone"], m, p=[0.5, 0.38, 0.12]),
            "category": category,
            "text": texts,
            "csat": csat,
            "resolution_hours": rng.lognormal(np.where(negative, 3.2, 2.2), 0.8).round(1),
        }
    ).sort_values("created_ts", ignore_index=True)
    out.insert(0, "ticket_id", 50001 + np.arange(m))
    return out


# --------------------------------------------------------------------------- experiments
@lru_cache(maxsize=None)
def _ab_checkout() -> pd.DataFrame:
    rng = np.random.default_rng(25)
    n = 42000
    variant = rng.choice(["control", "treatment"], n)
    device = rng.choice(["mobile", "desktop"], n, p=[0.62, 0.38])
    u = rng.normal(0, 1, n)  # purchase propensity
    returning = rng.random(n) < 0.6
    base = np.where(device == "mobile", 0.080, 0.150)
    lift = np.where((variant == "treatment") & (device == "mobile"), 0.014, 0.0)
    logit = np.log((base + lift) / (1 - base - lift)) + 0.6 * u - 0.18
    converted = rng.random(n) < 1 / (1 + np.exp(-logit))
    revenue = np.where(converted, rng.lognormal(4.0 + 0.15 * u, 0.55), 0.0).round(2)
    prior = np.where(returning, np.maximum(0, 45 + 40 * u + rng.normal(0, 30, n)), 0.0).round(2)
    return pd.DataFrame(
        {
            "user_id": 700001 + np.arange(n),
            "assigned_date": pd.Timestamp("2024-09-02") + pd.to_timedelta(rng.integers(0, 14, n), unit="D"),
            "variant": variant,
            "device": device,
            "returning": returning,
            "prior_spend_90d": prior,
            "converted": converted,
            "revenue": revenue,
        }
    )


@lru_cache(maxsize=None)
def _ab_shipping() -> pd.DataFrame:
    rng = np.random.default_rng(16)
    n = 31000
    variant = rng.choice(["control", "treatment"], n)
    browser = rng.choice(["chrome", "safari", "firefox", "edge"], n, p=[0.55, 0.28, 0.07, 0.10])
    base = pd.Series(browser).map({"chrome": 0.11, "safari": 0.07, "firefox": 0.10, "edge": 0.10}).to_numpy()
    converted = rng.random(n) < base  # the banner has no true effect
    df = pd.DataFrame(
        {
            "user_id": 800001 + np.arange(n),
            "assigned_date": pd.Timestamp("2024-10-07") + pd.to_timedelta(rng.integers(0, 14, n), unit="D"),
            "variant": variant,
            "browser": browser,
            "converted": converted,
        }
    )
    # A tracking bug drops 30% of Safari users in treatment before they are logged.
    lost = (df["variant"] == "treatment") & (df["browser"] == "safari") & (rng.random(n) < 0.30)
    return df[~lost].reset_index(drop=True)


# --------------------------------------------------------------------------- demand
@lru_cache(maxsize=None)
def _daily_demand() -> pd.DataFrame:
    rng = np.random.default_rng(17)
    dates = pd.date_range("2022-01-01", "2024-12-31", freq="D")
    t = np.arange(len(dates))
    doy = dates.dayofyear.to_numpy()
    dow = dates.dayofweek.to_numpy()
    frames = []
    spec = {
        "Kitchen": dict(level=120, trend=0.035, dow=[0.92, 0.88, 0.90, 0.95, 1.02, 1.18, 1.15], peak=330, amp=0.45),
        "Bedding": dict(level=60, trend=0.012, dow=[0.95, 0.92, 0.93, 0.96, 1.00, 1.14, 1.10], peak=300, amp=0.25),
        "Outdoor": dict(level=45, trend=0.020, dow=[0.85, 0.82, 0.86, 0.92, 1.05, 1.28, 1.22], peak=165, amp=0.80),
    }
    for cat, s in spec.items():
        season = 1 + s["amp"] * np.exp(-0.5 * ((((doy - s["peak"]) + 182) % 365 - 182) / 28) ** 2)
        promo = rng.random(len(dates)) < 0.06
        promo |= np.roll(promo, 1) | np.roll(promo, 2)  # promos run for three days
        mean = (s["level"] + s["trend"] * t) * np.array(s["dow"])[dow] * season * np.where(promo, 1.35, 1.0)
        units = rng.poisson(mean * rng.gamma(40, 1 / 40, len(dates)))
        frames.append(pd.DataFrame({"date": dates, "category": cat, "units": units, "on_promo": promo}))
    df = pd.concat(frames, ignore_index=True)
    # Real feeds have holes: a stock-out and a few days the export job failed.
    stockout = (df["category"] == "Outdoor") & df["date"].between("2024-06-11", "2024-06-13")
    df.loc[stockout, "units"] = 0
    failed = (df["category"] == "Bedding") & df["date"].isin(pd.to_datetime(["2023-03-07", "2023-03-08", "2024-02-19"]))
    return df[~failed].reset_index(drop=True)


# --------------------------------------------------------------------------- public API
_LOADERS = {
    "customers": _customers,
    "products": _products,
    "orders": lambda: _orders_and_items()[0],
    "order_items": lambda: _orders_and_items()[1],
    "tickets": _tickets,
    "ab_checkout": _ab_checkout,
    "ab_shipping": _ab_shipping,
    "daily_demand": _daily_demand,
}


def load(name: str) -> pd.DataFrame:
    """Return a fresh copy of one table. See dsw.tables() for the list."""
    if name not in _LOADERS:
        raise KeyError(f"Unknown table {name!r}. Available: {', '.join(_LOADERS)}")
    return _LOADERS[name]().copy()


def tables() -> pd.DataFrame:
    """List the available tables with their size and a one-line description."""
    rows = []
    for name in _LOADERS:
        df = _LOADERS[name]()
        rows.append({"table": name, "rows": len(df), "columns": df.shape[1], "description": _DESCRIPTIONS[name]})
    return pd.DataFrame(rows)


def register_duckdb(con=None):
    """Make every table queryable by name from DuckDB. Returns the connection."""
    import duckdb

    con = con or duckdb.default_connection()
    for name in _LOADERS:
        con.register(name, _LOADERS[name]())
    return con


def export(folder: str = "data") -> list[str]:
    """Write the tables to disk the way you'd find them at work: Parquet for the
    warehouse tables, CSV for small reference data, plus one messy raw export."""
    os.makedirs(os.path.join(folder, "raw"), exist_ok=True)
    paths = []
    for name in ["orders", "order_items", "tickets", "daily_demand"]:
        path = os.path.join(folder, f"{name}.parquet")
        load(name).to_parquet(path, index=False)
        paths.append(path)
    for name in ["customers", "products"]:
        path = os.path.join(folder, f"{name}.csv")
        load(name).to_csv(path, index=False)
        paths.append(path)
    path = os.path.join(folder, "raw", "orders_export.csv")
    with open(path, "w", encoding="utf-8") as f:
        f.write(raw_orders_csv())
    paths.append(path)
    return paths


# --------------------------------------------------------------------------- exercise checks
def same(result, expected, *, ordered: bool = False, rtol: float = 1e-6) -> None:
    """Assert that `result` holds the same data as `expected` (used by exercise
    checks). Column order, extra columns and letter case of names are ignored;
    row order is ignored unless ordered=True."""
    if hasattr(result, "to_dicts"):  # a Polars DataFrame
        result = pd.DataFrame(result.to_dicts())
    if hasattr(result, "to_frame") and not isinstance(result, pd.DataFrame):
        result = result.reset_index() if result.index.name else result.to_frame()
    assert isinstance(result, pd.DataFrame), f"expected a DataFrame, got {type(result).__name__}"
    r, e = result.copy(), expected.copy()
    if r.index.name or isinstance(r.index, pd.MultiIndex):
        r = r.reset_index()
    r.columns = [str(c).lower() for c in r.columns]
    e.columns = [str(c).lower() for c in e.columns]
    missing = [c for c in e.columns if c not in r.columns]
    assert not missing, f"missing column(s) {missing}; yours are {list(r.columns)}"
    assert len(r) == len(e), f"expected {len(e)} rows, got {len(r)}"
    r = r[list(e.columns)].reset_index(drop=True)
    e = e.reset_index(drop=True)

    def is_num(s):
        return pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s)

    def col_equal(a, b):
        if is_num(a) and is_num(b):
            return np.isclose(a.astype(float), b.astype(float), rtol=rtol, atol=1e-9, equal_nan=True)
        if pd.api.types.is_datetime64_any_dtype(b):
            return (pd.to_datetime(a).astype("datetime64[ns]") == b.astype("datetime64[ns]")).to_numpy()
        return (a.astype(str).str.strip() == b.astype(str).str.strip()).to_numpy()

    def sort(df):
        keys = [c for c in df.columns if not pd.api.types.is_float_dtype(df[c])] or list(df.columns)
        keyed = df.assign(**{c: df[c].astype(str) for c in keys if df[c].dtype == object})
        return df.loc[keyed.sort_values(keys, kind="stable").index].reset_index(drop=True)

    def first_diff(a, b):
        for c in b.columns:
            try:
                ok = col_equal(a[c], b[c])
            except Exception:
                return f"column {c!r} has an unexpected type ({a[c].dtype})"
            if not ok.all():
                i = int(np.argmin(ok))
                return f"column {c!r} differs (e.g. yours {a[c].iloc[i]!r}, expected {b[c].iloc[i]!r})"
        return None

    if ordered:
        diff = first_diff(r, e)
        if diff and first_diff(sort(r), sort(e)) is None:
            raise AssertionError("the values are right but the rows are in the wrong order")
    else:
        diff = first_diff(sort(r), sort(e))
    assert diff is None, diff


def run_pytest(*args: str, quiet_output: bool = False) -> int:
    """Run pytest in this session and return its exit code (0 = all tests passed).
    Modules under the current folder are re-imported, so edits to files take effect."""
    import contextlib
    import importlib
    import sys

    import pytest

    here = os.getcwd()
    for name, mod in list(sys.modules.items()):
        if getattr(mod, "__file__", None) and str(mod.__file__).startswith(here):
            del sys.modules[name]
    # Files edited twice within one second can otherwise be served from stale bytecode.
    import shutil

    sys.dont_write_bytecode = True
    for root, dirs, _ in os.walk(here):
        if "__pycache__" in dirs:
            shutil.rmtree(os.path.join(root, "__pycache__"), ignore_errors=True)
    importlib.invalidate_caches()
    if here not in sys.path:
        sys.path.insert(0, here)
    argv = ["-q", "-p", "no:cacheprovider", "--color=no", *args]
    if quiet_output:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return int(pytest.main(argv))
    return int(pytest.main(argv))


# --------------------------------------------------------------------------- messy export
@lru_cache(maxsize=None)
def raw_orders_csv() -> str:
    """A deliberately messy CSV export of 2,000 orders, as an ops team might send it."""
    rng = np.random.default_rng(18)
    orders, _ = _orders_and_items()
    c = _customers()
    df = orders[orders["order_ts"] >= "2024-07-01"].sample(2000, random_state=18).merge(
        c[["customer_id", "country"]], on="customer_id"
    )
    n = len(df)
    ts = df["order_ts"]
    fmt = rng.choice(3, n, p=[0.70, 0.20, 0.10])
    date_str = np.where(
        fmt == 0,
        ts.dt.strftime("%Y-%m-%d %H:%M:%S"),
        np.where(fmt == 1, ts.dt.strftime("%d/%m/%Y %H:%M"), ts.dt.strftime("%b %d, %Y")),
    )
    total = df["total"].to_numpy()
    tfmt = rng.choice(3, n, p=[0.6, 0.3, 0.1])
    total_str = np.where(
        tfmt == 0, [f"{v:.2f}" for v in total], np.where(tfmt == 1, [f"${v:,.2f}" for v in total], [f"{v:.2f} USD" for v in total])
    ).astype(object)
    in_cents = rng.choice(np.flatnonzero(total > 60), 6, replace=False)
    total_str[in_cents] = [f"{total[i] * 100:.0f}" for i in in_cents]  # logged in cents by mistake
    total_str[rng.choice(np.setdiff1d(np.arange(n), in_cents), 25, replace=False)] = ""

    variants = {
        "US": ["US", "US", "US", "usa", "United States", "U.S."],
        "UK": ["UK", "UK", "GB", "United Kingdom", "uk "],
        "DE": ["DE", "DE", "Germany", "de"],
        "FR": ["FR", "FR", "France"],
        "CA": ["CA", "CA", "Canada"],
    }
    country = [variants[x][rng.integers(len(variants[x]))] for x in df["country"]]
    status = df["status"].to_numpy().astype(object)
    s = rng.random(n)
    status = np.where(s < 0.10, [x.upper() for x in status], np.where(s < 0.18, [f" {x} " for x in status], status)).astype(object)
    status[rng.choice(n, 30, replace=False)] = "N/A"

    out = pd.DataFrame(
        {
            "Order ID": df["order_id"].to_numpy(),
            "Customer ID": df["customer_id"].to_numpy(),
            "Order Date": date_str,
            " Status": status,
            "Country": country,
            "Discount %": [f"{d}%" for d in df["discount_pct"]],
            "Total ": total_str,
        }
    )
    # Internal QA orders that should never reach an analysis.
    test = out.sample(12, random_state=1).assign(**{"Customer ID": 0, "Total ": "0.00"})
    test["Order ID"] = 999000 + np.arange(len(test))
    out = pd.concat([out, test, out.sample(40, random_state=2)], ignore_index=True)  # + exact duplicates
    out = out.sample(frac=1, random_state=3, ignore_index=True)
    return out.to_csv(index=False)


# --------------------------------------------------------------------------- churn snapshot
def churn_snapshot(cutoff: str = "2024-07-01", horizon_days: int = 90) -> pd.DataFrame:
    """Point-in-time modelling table (see _churn_snapshot). Returns a fresh copy."""
    return _churn_snapshot(str(pd.Timestamp(cutoff).date()), int(horizon_days)).copy()


@lru_cache(maxsize=None)
def _churn_snapshot(cutoff: str, horizon_days: int) -> pd.DataFrame:
    """Point-in-time modelling table: features use only data before `cutoff`;
    `churned` is True when the customer places no completed order in the
    `horizon_days` after it. Includes customers with a completed order in the
    180 days before the cutoff."""
    cutoff_ts = pd.Timestamp(cutoff)
    end = cutoff_ts + pd.Timedelta(days=horizon_days)
    if end > END + pd.Timedelta(days=1):
        raise ValueError(f"cutoff + horizon must end by {END.date()}")
    c = _customers()
    orders, _ = _orders_and_items()
    tickets = _tickets()
    done = orders[orders["status"] == "completed"]
    past = done[done["order_ts"] < cutoff_ts]
    future = done[(done["order_ts"] >= cutoff_ts) & (done["order_ts"] < end)]

    def window(df, days):
        return df[df["order_ts"] >= cutoff_ts - pd.Timedelta(days=days)]

    g = past.groupby("customer_id")
    f = pd.DataFrame(
        {
            "recency_days": (cutoff_ts - g["order_ts"].max()).dt.days,
            "orders_total": g.size(),
            "avg_order_value": g["total"].mean().round(2),
        }
    )
    f["discount_share"] = (past["discount_pct"] > 0).groupby(past["customer_id"]).mean().round(3)
    for days in (90, 365):
        w = window(past, days).groupby("customer_id")
        f[f"orders_{days}d"] = w.size()
        f[f"spend_{days}d"] = w["total"].sum().round(2)
    all_past = orders[orders["order_ts"] < cutoff_ts]
    f["refund_rate"] = (all_past["status"] == "refunded").groupby(all_past["customer_id"]).mean().round(3)
    tk = tickets[(tickets["created_ts"] < cutoff_ts) & (tickets["created_ts"] >= cutoff_ts - pd.Timedelta(days=180))]
    f["tickets_180d"] = tk.groupby("customer_id").size()
    f["neg_tickets_180d"] = tk[tk["category"].isin(_NEGATIVE)].groupby("customer_id").size()
    f["min_csat_180d"] = tk.groupby("customer_id")["csat"].min()
    f = f[f["recency_days"] <= 180].reset_index()
    count_cols = ["orders_90d", "orders_365d", "spend_90d", "spend_365d", "tickets_180d", "neg_tickets_180d"]
    f[count_cols] = f[count_cols].fillna(0)
    f = f.merge(c, on="customer_id", how="left", validate="one_to_one")
    f["tenure_days"] = (cutoff_ts - f["signup_date"]).dt.days
    f["churned"] = ~f["customer_id"].isin(future["customer_id"])
    cols = [
        "customer_id", "tenure_days", "recency_days", "orders_total", "orders_90d", "orders_365d", "spend_90d",
        "spend_365d", "avg_order_value", "discount_share", "refund_rate", "tickets_180d", "neg_tickets_180d",
        "min_csat_180d", "plus_member", "channel", "device", "country", "age", "churned",
    ]
    return f[cols]


# --------------------------------------------------------------------------- stand-in LLM
class FakeLLM:
    """A deterministic stand-in for a hosted LLM, so the lessons run offline and
    for free. It returns the kinds of output real models return, including the
    annoying ones: Markdown fences, chatty preambles, near-miss labels and the
    occasional truncated reply. Swap in a real client on your own machine."""

    def __init__(self, seed: int = 0):
        self.seed = seed
        self.calls = 0
        self.input_tokens = 0
        self.output_tokens = 0

    _KEYWORDS = [
        ("refund_request", r"refund|money back"),
        ("damaged_item", r"broken|cracked|scratch|shattered|missing|dent"),
        ("billing", r"charged|charge|card|discount code"),
        ("account", r"log in|account|address|password|membership|email"),
        ("shipping_delay", r"late|tracking|waiting|hasn't shown|arrive|ship"),
        ("product_question", r"."),
    ]
    _SYNONYMS = {
        "shipping_delay": ["Shipping Delay", "late_delivery", "shipping"],
        "damaged_item": ["Damaged Item", "damaged", "broken_item"],
        "refund_request": ["Refund", "refund", "Refund Request"],
        "billing": ["Billing", "billing_issue", "payment"],
        "product_question": ["Product Question", "question", "product_info"],
        "account": ["Account", "account_issue", "login"],
    }

    def complete(self, prompt: str) -> str:
        """Return the model's reply to `prompt` as a string."""
        self.calls += 1
        ticket = prompt.rsplit("Ticket:", 1)[-1].strip()
        h = int.from_bytes(__import__("hashlib").md5(f"{self.seed}|{ticket}".encode()).digest()[:4], "big")
        r = (h % 10000) / 10000
        strict = bool(re.search(r"only.{0,40}json|json only|no other text", prompt, re.I))
        has_labels = all(c in prompt for c in TICKET_CATEGORIES)
        has_examples = prompt.count("Ticket:") >= 3

        label = next(c for c, pat in self._KEYWORDS if re.search(pat, ticket, re.I))
        # Typical confusions: a refund for a late/damaged order; a billing complaint mentioning membership.
        error_rate = 0.16 - (0.07 if has_examples else 0) - (0.03 if has_labels else 0)
        if r < error_rate:
            label = TICKET_CATEGORIES[(TICKET_CATEGORIES.index(label) + 1 + h % 4) % 6]
        if not has_labels and (h >> 3) % 100 < 45:
            label = self._SYNONYMS[label][(h >> 5) % 3]
        urgency = "high" if re.search(r"weekend|far too long|very disappointed|twice|shattered", ticket, re.I) else (
            "low" if label in ("product_question", "account") else "medium"
        )
        m = re.search(r"#?(1\d{5})\b", ticket)
        payload = {"category": label, "urgency": urgency, "order_id": int(m.group(1)) if m else None}
        body = json.dumps(payload)

        q = ((h >> 7) % 1000) / 1000
        if strict:
            if q < 0.06:
                out = f"```json\n{body}\n```"
            elif q < 0.08:
                out = body[: len(body) - 9]  # truncated: hit the max-token limit
            else:
                out = body
        else:
            if q < 0.35:
                out = f"```json\n{body}\n```"
            elif q < 0.60:
                out = f"Sure! Here is the classification:\n\n{body}\n\nLet me know if you need anything else."
            elif q < 0.66:
                out = body[: len(body) - 9]
            else:
                out = body
        self.input_tokens += len(prompt) // 4
        self.output_tokens += len(out) // 4
        return out
