"""Keyword clustering and listing audit. Original rule-based logic; no AI text generation.

Limits used by the audit (title length, bullet length) are configurable defaults, not Amazon facts:
they vary by category and change over time. Check Seller Central's style guide for your category.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

STOP = {"a", "an", "and", "the", "for", "of", "to", "in", "on", "with", "by", "or", "at", "is", "it", "your", "you", "from", "as"}
RISKY = ["best seller", "#1", "number one", "guarantee", "guaranteed", "free shipping", "cures", "cure", "treats",
         "heals", "clinically proven", "100% safe", "fda approved", "bpa free"]  # prompts a manual policy check; not exhaustive


def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text.lower())]


def stem(w: str) -> str:
    """Tiny suffix stripper. Good enough to group 'spatula'/'spatulas'; not a linguistic stemmer."""
    for suf in ("ings", "ing", "ies", "es", "s", "ed"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def stems(phrase: str) -> frozenset[str]:
    return frozenset(stem(t) for t in tokens(phrase) if t not in STOP)


def cluster_keywords(items: list[dict], threshold: float = 0.5) -> list[dict]:
    """Group phrases whose stem sets overlap (Jaccard >= threshold). items: {phrase, volume?}.

    Greedy single-link grouping with union-find. Deterministic for a given input order.
    """
    n = len(items)
    parent = list(range(n))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    sets = [stems(i["phrase"]) for i in items]
    for a in range(n):
        for b in range(a + 1, n):
            if not sets[a] or not sets[b]:
                continue
            inter, uni = len(sets[a] & sets[b]), len(sets[a] | sets[b])
            if uni and inter / uni >= threshold:
                parent[find(b)] = find(a)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    out = []
    for idxs in groups.values():
        members = [items[i] for i in idxs]
        top = max(members, key=lambda m: (m.get("volume") or 0, -len(m["phrase"])))
        common = Counter(s for i in idxs for s in sets[i]).most_common(3)
        vols = [m.get("volume") for m in members if m.get("volume") is not None]
        out.append({"label": top["phrase"], "top_terms": [c[0] for c in common], "size": len(members),
                    "total_volume": sum(vols) if vols else None, "members": members})
    out.sort(key=lambda g: (-(g["total_volume"] or 0), -g["size"], g["label"]))
    return out


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1 and not w.endswith("le"):
        n -= 1
    return max(1, n)


def readability(text: str) -> dict:
    sentences = [s for s in re.split(r"[.!?]+|\n", text) if s.strip()]
    words = tokens(text)
    if not words or not sentences:
        return {"words": 0, "sentences": 0, "avg_sentence_words": None, "flesch": None}
    syl = sum(syllables(w) for w in words)
    wps, spw = len(words) / len(sentences), syl / len(words)
    return {"words": len(words), "sentences": len(sentences), "avg_sentence_words": round(wps, 1),
            "flesch": round(206.835 - 1.015 * wps - 84.6 * spw, 1)}


def contains_phrase(text: str, phrase: str) -> bool:
    tt, pt = [stem(t) for t in tokens(text)], [stem(t) for t in tokens(phrase)]
    if not pt:
        return False
    return any(tt[i:i + len(pt)] == pt for i in range(len(tt) - len(pt) + 1))


def words_all_present(text: str, phrase: str) -> bool:
    have = {stem(t) for t in tokens(text)}
    need = [stem(t) for t in tokens(phrase) if t not in STOP]
    return bool(need) and all(w in have for w in need)


@dataclass
class AuditConfig:
    title_max: int = 200
    title_front_chars: int = 80
    bullet_max: int = 500
    bullets_expected: int = 5
    repeat_limit: int = 3


@dataclass
class Finding:
    level: str  # "problem" | "warning" | "ok"
    area: str
    message: str


@dataclass
class AuditResult:
    findings: list[Finding] = field(default_factory=list)
    coverage: list[dict] = field(default_factory=list)
    coverage_pct: float | None = None
    readability: dict = field(default_factory=dict)


def audit_listing(title: str, bullets: list[str], keywords: list[dict], description: str = "",
                  cfg: AuditConfig | None = None) -> AuditResult:
    cfg = cfg or AuditConfig()
    r = AuditResult()
    add = lambda lvl, area, msg: r.findings.append(Finding(lvl, area, msg))  # noqa: E731
    bullets = [b for b in bullets if b.strip()]
    if not title.strip():
        add("problem", "Title", "Title is empty.")
    else:
        if len(title) > cfg.title_max:
            add("problem", "Title", f"{len(title)} characters; the configured limit is {cfg.title_max}.")
        else:
            add("ok", "Title", f"{len(title)} of {cfg.title_max} characters.")
        letters = [c for c in title if c.isalpha()]
        if letters and sum(c.isupper() for c in letters) / len(letters) > 0.5:
            add("warning", "Title", "Mostly capital letters; Title Case reads better and some categories restrict all-caps.")
    if len(bullets) < cfg.bullets_expected:
        add("warning", "Bullets", f"{len(bullets)} bullets; most categories use {cfg.bullets_expected}.")
    for n, b in enumerate(bullets, 1):
        if len(b) > cfg.bullet_max:
            add("problem", f"Bullet {n}", f"{len(b)} characters; configured limit {cfg.bullet_max}.")
    full = " ".join([title, *bullets, description])
    low = full.lower()
    for term in RISKY:
        if term in low:
            add("warning", "Policy", f"'{term}' can trigger a policy review. Check Amazon's rules for your category.")
    kws = sorted(keywords, key=lambda k: -(k.get("volume") or 0))
    covered = 0
    for k in kws:
        ph = k["phrase"]
        in_title, in_bul = contains_phrase(title, ph), any(contains_phrase(b, ph) for b in bullets)
        in_desc = contains_phrase(description, ph)
        status = "exact phrase" if (in_title or in_bul or in_desc) else "words only" if words_all_present(full, ph) else "missing"
        if status != "missing":
            covered += 1
        r.coverage.append({"phrase": ph, "volume": k.get("volume"), "in_title": in_title, "in_bullets": in_bul,
                           "in_description": in_desc, "status": status})
        if status == "missing" and (k.get("volume") or 0) > 0:
            add("warning", "Keywords", f"'{ph}' (volume {k.get('volume'):,.0f}) is not covered.")
        if in_title and title.lower().find(ph.lower()) > cfg.title_front_chars:
            add("warning", "Title", f"'{ph}' appears after the first {cfg.title_front_chars} characters, which are most visible in search.")
        reps = len(re.findall(re.escape(ph.lower()), low))
        if reps > cfg.repeat_limit:
            add("warning", "Keywords", f"'{ph}' appears {reps} times; repeating it adds nothing and reads as stuffing.")
    if kws:
        r.coverage_pct = round(100 * covered / len(kws), 1)
    r.readability = readability(" ".join(bullets + ([description] if description else [])))
    fl = r.readability.get("flesch")
    if fl is not None and fl < 40:
        add("warning", "Readability", f"Flesch score {fl}: dense. Shorter sentences help shoppers skim.")
    return r


def title_skeleton(brand: str, primary_keyword: str, attributes: list[str], max_len: int = 200) -> str:
    """Brand + primary keyword + up to N attributes, trimmed on a word boundary. A starting point only."""
    parts = [p.strip() for p in [brand, primary_keyword] if p and p.strip()]
    head = " ".join(parts)
    attrs = [a.strip() for a in attributes if a.strip()]
    out = head
    for a in attrs:
        trial = f"{out}, {a}" if out else a
        if len(trial) > max_len:
            break
        out = trial
    return out[:max_len].rstrip(", ")
