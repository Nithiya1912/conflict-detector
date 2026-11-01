from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import GuidelineIn, SearchIn
from ..security import get_current_user, require_admin
from ..services import kg, retrieval
from ..services.audit import audit
from ..services.knowledge import CORE_CATEGORIES, EXTENSION_CATEGORIES, RULES

router = APIRouter(prefix="/api", tags=["knowledge"])


@router.get("/graph")
def graph(case_id: str | None = None, background: bool = True, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return kg.explorer_graph(db, case_id, include_background=background)


@router.get("/rules")
def rules(_: models.User = Depends(get_current_user)):
    return {"core_categories": CORE_CATEGORIES, "extension_categories": EXTENSION_CATEGORIES,
            "rules": [{"id": r.id, "category": r.category, "title": r.title, "base_severity": r.base_severity,
                       "a_classes": r.a_classes, "b_classes": r.b_classes, "mechanism": r.mechanism,
                       "timing_sensitive": r.timing_sensitive, "is_extension": r.category not in CORE_CATEGORIES} for r in RULES]
            + [{"id": "R-OPP-DIET", "category": "Diet–Diet", "title": "Opposite-direction instructions on the same nutrient",
                "base_severity": "moderate", "mechanism": "Generated from KG nutrient axes", "is_extension": False},
               {"id": "R-OPP-LIFE", "category": "Lifestyle–Lifestyle", "title": "Opposite-direction lifestyle instructions",
                "base_severity": "moderate", "mechanism": "Generated from KG factor axes", "is_extension": True},
               {"id": "R-DUP", "category": "Other cross-instruction", "title": "Duplicate / contradictory medication instructions",
                "base_severity": "low–moderate", "mechanism": "Same medication in multiple notes", "is_extension": True},
               {"id": "R-DD-DUPCLASS", "category": "Drug–Drug", "title": "Therapeutic duplication (same class)",
                "base_severity": "moderate–high", "mechanism": "KG class overlap", "is_extension": False}]}


def _doc_out(d: models.GuidelineDocument, with_chunks: bool = False) -> dict:
    out = {k: getattr(d, k) for k in ("id", "title", "issuer", "publication_date", "source_url", "license_note", "is_synthetic",
                                       "status", "chunk_count", "created_at", "indexed_at")}
    if with_chunks:
        out["content"] = d.content
        out["chunks"] = [{"id": c.id, "ordinal": c.ordinal, "section": c.section, "page": c.page, "text": c.text} for c in d.chunks]
    return out


@router.get("/guidelines")
def list_guidelines(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    docs = db.scalars(select(models.GuidelineDocument).order_by(models.GuidelineDocument.id)).all()
    usage: dict[int, int] = {}
    for c in db.scalars(select(models.Conflict)).all():
        for e in c.evidence:
            if e.get("supporting"):
                usage[e["document_id"]] = usage.get(e["document_id"], 0) + 1
    return [{**_doc_out(d), "used_by_findings": usage.get(d.id, 0)} for d in docs]


@router.get("/guidelines/{doc_id}")
def get_guideline(doc_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    d = db.get(models.GuidelineDocument, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    out = _doc_out(d, True)
    out["used_by"] = [{"conflict_id": c.id, "case_id": c.case_id, "title": c.title,
                       "chunk_ids": [e["chunk_id"] for e in c.evidence if e["document_id"] == d.id and e.get("supporting")]}
                      for c in db.scalars(select(models.Conflict)).all()
                      if any(e["document_id"] == d.id and e.get("supporting") for e in c.evidence)]
    return out


@router.post("/guidelines", status_code=201)
def add_guideline(body: GuidelineIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    d = models.GuidelineDocument(**body.model_dump(), is_synthetic=False, status="pending")
    db.add(d)
    db.flush()
    retrieval.index_document(db, d)
    audit(db, user, "guideline.add", "guideline", d.id, d.title, request)
    db.commit()
    return _doc_out(d)


@router.post("/guidelines/{doc_id}/reindex")
def reindex(doc_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    d = db.get(models.GuidelineDocument, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    retrieval.index_document(db, d)
    audit(db, user, "guideline.reindex", "guideline", d.id, f"{d.chunk_count} chunks", request)
    db.commit()
    return _doc_out(d)


@router.delete("/guidelines/{doc_id}", status_code=204)
def delete_guideline(doc_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    d = db.get(models.GuidelineDocument, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    audit(db, user, "guideline.delete", "guideline", d.id, d.title, request)
    db.delete(d)
    db.commit()
    retrieval.invalidate()


@router.post("/guidelines/search")
def search(body: SearchIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    hits = [h.to_dict() for h in retrieval.get_store(db).search(body.query, body.top_k)]
    db.add(models.RetrievalLog(query=body.query, origin="search", results=[
        {"chunk_id": h["chunk_id"], "title": h["title"], "score": h["score"]} for h in hits]))
    db.commit()
    return {"query": body.query, "results": hits,
            "note": "Scores are TF-IDF cosine retrieval scores (lexical relevance), not measures of clinical truth."}


@router.get("/retrieval/history")
def retrieval_history(limit: int = 50, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    rows = db.scalars(select(models.RetrievalLog).order_by(models.RetrievalLog.id.desc()).limit(min(limit, 200))).all()
    return [{"id": r.id, "query": r.query, "origin": r.origin, "case_id": r.case_id, "results": r.results, "created_at": r.created_at}
            for r in rows]
