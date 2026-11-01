"""Local vector index for the RAG pipeline.

Development adapter: sparse TF-IDF vectors with cosine similarity, persisted per chunk
(term counts) in the database. Scores are *retrieval relevance* scores, not clinical
truth scores. The `VectorStore` protocol allows swapping in a dense-embedding store
(e.g. pgvector, Chroma) without changing callers.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models

STOPWORDS = set("""a an and are as at be by for from has have in is it its of on or that the this to was were will with
which who whom whose may can should would could not no than then there these those their them they such into about
also when where while within without other more most some any each per via""".split())
TOKEN_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)?")


def tokenize(text: str) -> list[str]:
    toks = [t for t in TOKEN_RE.findall(text.lower()) if t not in STOPWORDS and len(t) > 1]
    # crude plural folding improves recall for "statins"/"statin"
    return [t[:-1] if len(t) > 4 and t.endswith("s") and not t.endswith("ss") else t for t in toks]


def chunk_document(content: str) -> list[dict]:
    """Split on markdown-style headings ('## ...') and optional page markers '[page N]'."""
    chunks: list[dict] = []
    section = None
    page = None
    buf: list[str] = []

    def flush():
        text = "\n".join(buf).strip()
        if text:
            # keep chunks small enough to be quotable
            paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
            cur = ""
            for p in paras:
                if len(cur) + len(p) > 900 and cur:
                    chunks.append({"section": section, "page": page, "text": cur})
                    cur = p
                else:
                    cur = f"{cur}\n\n{p}" if cur else p
            if cur:
                chunks.append({"section": section, "page": page, "text": cur})
        buf.clear()

    for line in content.splitlines():
        pm = re.match(r"^\s*\[page\s+(\w+)\]\s*$", line, re.I)
        if pm:
            flush()
            page = pm.group(1)
            continue
        hm = re.match(r"^\s*#{1,4}\s+(.*)$", line)
        if hm:
            flush()
            section = hm.group(1).strip()
            continue
        buf.append(line)
    flush()
    return chunks


def index_document(db: Session, doc: models.GuidelineDocument) -> None:
    doc.chunks.clear()
    db.flush()
    try:
        for i, ch in enumerate(chunk_document(doc.content)):
            doc.chunks.append(models.GuidelineChunk(ordinal=i, section=ch["section"], page=ch["page"], text=ch["text"],
                                                    term_counts=dict(Counter(tokenize((ch["section"] or "") + " " + ch["text"])))))
        doc.chunk_count = len(doc.chunks)
        doc.status = "indexed" if doc.chunk_count else "failed"
        doc.indexed_at = datetime.now(timezone.utc)
    except Exception:  # pragma: no cover - defensive
        doc.status = "failed"
        raise
    invalidate()


@dataclass
class Hit:
    chunk_id: int
    document_id: int
    title: str
    issuer: str | None
    publication_date: str | None
    section: str | None
    page: str | None
    text: str
    score: float
    is_synthetic: bool
    source_url: str | None

    def to_dict(self) -> dict:
        return self.__dict__.copy()


class VectorStore(Protocol):
    def search(self, query: str, top_k: int = 3) -> list[Hit]: ...


class TfidfStore:
    def __init__(self, rows: list[tuple]):
        self.rows = rows  # (chunk, doc)
        n = len(rows) or 1
        df: Counter = Counter()
        for ch, _ in rows:
            df.update(ch.term_counts.keys())
        self.idf = {t: math.log((1 + n) / (1 + c)) + 1 for t, c in df.items()}
        self.vecs = []
        for ch, _ in rows:
            v = {t: (1 + math.log(c)) * self.idf[t] for t, c in ch.term_counts.items()}
            norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
            self.vecs.append({t: x / norm for t, x in v.items()})

    def search(self, query: str, top_k: int = 3) -> list[Hit]:
        qc = Counter(tokenize(query))
        qv = {t: (1 + math.log(c)) * self.idf.get(t, 0.0) for t, c in qc.items()}
        norm = math.sqrt(sum(x * x for x in qv.values())) or 1.0
        scored = []
        for (ch, doc), v in zip(self.rows, self.vecs):
            s = sum(w / norm * v.get(t, 0.0) for t, w in qv.items())
            if s > 0:
                scored.append((s, ch, doc))
        scored.sort(key=lambda t: -t[0])
        return [Hit(ch.id, doc.id, doc.title, doc.issuer, doc.publication_date, ch.section, ch.page, ch.text,
                    round(s, 4), doc.is_synthetic, doc.source_url) for s, ch, doc in scored[:top_k]]


_cache: dict = {"v": 0, "store": None, "key": None}


def invalidate() -> None:
    _cache["v"] += 1
    _cache["store"] = None


def get_store(db: Session) -> TfidfStore:
    key = (str(db.get_bind().url), _cache["v"])
    if _cache["store"] is None or _cache["key"] != key:
        rows = db.execute(
            select(models.GuidelineChunk, models.GuidelineDocument)
            .join(models.GuidelineDocument)
            .where(models.GuidelineDocument.status == "indexed")
        ).all()
        _cache["store"] = TfidfStore([(c, d) for c, d in rows])
        _cache["key"] = key
    return _cache["store"]


def supports(hit_text: str, terms_a: tuple[str, ...], terms_b: tuple[str, ...]) -> bool:
    """A passage *supports* a relation only if it mentions both sides of it."""
    low = hit_text.lower()
    return any(t in low for t in terms_a) and any(t in low for t in terms_b)
