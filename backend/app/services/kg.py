"""Knowledge Graph built with NetworkX from stored relations, instructions and conflicts."""
from functools import lru_cache

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from .knowledge import RULES_BY_ID

HIERARCHY_RELATIONS = {"IS_A", "CONTAINS", "SUBCLASS_OF"}


class BackgroundGraph:
    """Hierarchy (entity -> class -> parent class) plus rule edges between classes."""

    def __init__(self, relations: list[tuple[str, str, str, str, str, str]]):
        self.g = nx.MultiDiGraph()
        self.hierarchy = nx.DiGraph()
        for src, stype, rel, tgt, ttype, prov in relations:
            self.g.add_node(src, type=stype)
            self.g.add_node(tgt, type=ttype)
            self.g.add_edge(src, tgt, relation=rel, provenance=prov)
            if rel in HIERARCHY_RELATIONS:
                self.hierarchy.add_edge(src, tgt, relation=rel)

    def ancestors(self, entity: str) -> set[str]:
        if entity not in self.hierarchy:
            return set()
        return set(nx.descendants(self.hierarchy, entity))

    def path(self, entity: str, cls: str) -> list[str]:
        try:
            return nx.shortest_path(self.hierarchy, entity, cls)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return []

    @property
    def size(self) -> tuple[int, int]:
        return self.g.number_of_nodes(), self.g.number_of_edges()


_version = {"v": 0}


def invalidate() -> None:
    _version["v"] += 1
    _load.cache_clear()


@lru_cache(maxsize=4)
def _load(_v: int, bind_key: str, rows: tuple) -> BackgroundGraph:
    return BackgroundGraph(list(rows))


def background_graph(db: Session) -> BackgroundGraph:
    rows = tuple(
        (r.source, r.source_type, r.relation, r.target, r.target_type, r.provenance)
        for r in db.scalars(select(models.KnowledgeRelation)).all()
    )
    return _load(_version["v"], str(db.get_bind().url), rows)


TYPE_FOR_KIND = {"medication": "medication", "diet": "diet", "lifestyle": "lifestyle"}


def explorer_graph(db: Session, case_id: str | None = None, include_background: bool = True) -> dict:
    """Assemble nodes/edges for the explorer from stored data.

    Node types: note, medication, diet (food/nutrient), lifestyle, class, guideline, conflict.
    """
    bg = background_graph(db)
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def add_node(nid: str, label: str, ntype: str, **data):
        if nid not in nodes:
            nodes[nid] = {"id": nid, "label": label, "type": ntype, "data": data}
        else:
            nodes[nid]["data"].update({k: v for k, v in data.items() if k not in nodes[nid]["data"]})
        return nodes[nid]

    q = select(models.Instruction).join(models.Case).where(models.Instruction.excluded.is_(False), models.Case.is_test.is_(False))
    if case_id:
        q = q.where(models.Instruction.case_id == case_id)
    else:
        q = q.where(models.Case.archived.is_(False))
    instructions = db.scalars(q).all()
    notes = {n.id: n for n in db.scalars(select(models.Note).where(models.Note.id.in_({i.note_id for i in instructions}))).all()}

    used_classes: set[str] = set()
    for ins in instructions:
        note = notes.get(ins.note_id)
        note_nid = f"note:{ins.note_id}"
        if note:
            add_node(note_nid, f"{note.specialty}: {note.title}", "note", case_id=note.case_id,
                     specialist=note.specialist_name, source_id=note.source_id)
        ent_nid = f"ent:{ins.entity}"
        ent = add_node(ent_nid, ins.entity, TYPE_FOR_KIND[ins.kind], entity=ins.entity, cases=[], sources=[])
        if ins.case_id not in ent["data"]["cases"]:
            ent["data"]["cases"].append(ins.case_id)
        ent["data"]["sources"].append({"note_id": ins.note_id, "case_id": ins.case_id, "span": ins.span_text,
                                       "direction": ins.direction, "source_id": note.source_id if note else None})
        edges.append({"id": f"e:ins:{ins.id}", "source": note_nid, "target": ent_nid, "relation": f"INSTRUCTS:{ins.direction}",
                      "data": {"instruction_id": ins.id, "case_id": ins.case_id}})
        if include_background:
            for cls in bg.ancestors(ins.entity):
                used_classes.add(cls)

    if include_background:
        for cls in used_classes:
            add_node(f"cls:{cls}", cls.replace("_", " "), "class")
        seen = set()
        for u, v, d in bg.g.edges(data=True):
            rel = d["relation"]
            src_id = f"ent:{u}" if f"ent:{u}" in nodes else f"cls:{u}"
            tgt_id = f"cls:{v}"
            if src_id not in nodes or tgt_id not in nodes:
                continue
            key = (src_id, tgt_id, rel)
            if key in seen:
                continue
            seen.add(key)
            rule_id = rel.split(":", 1)[1] if ":" in rel else None
            edges.append({"id": f"e:bg:{len(edges)}", "source": src_id, "target": tgt_id,
                          "relation": rel.split(":")[0], "data": {"rule_id": rule_id, "provenance": d.get("provenance"),
                                                                  "rule_title": RULES_BY_ID[rule_id].title if rule_id in RULES_BY_ID else None}})

    cq = select(models.Conflict).join(models.Case).where(models.Case.is_test.is_(False))
    if case_id:
        cq = cq.where(models.Conflict.case_id == case_id)
    else:
        cq = cq.where(models.Case.archived.is_(False))
    for c in db.scalars(cq).all():
        cid = f"cnf:{c.id}"
        add_node(cid, c.id, "conflict", case_id=c.case_id, severity=c.severity, category=c.category,
                 title=c.title, validation_status=c.validation_status, confidence=c.confidence)
        for snap in c.instructions_snapshot:
            ent_id = f"ent:{snap['entity']}"
            if ent_id in nodes:
                edges.append({"id": f"e:cf:{c.id}:{snap['id']}", "source": ent_id, "target": cid,
                              "relation": "TRIGGERS", "data": {"rule_id": c.rule_id, "case_id": c.case_id}})
        for ev in c.evidence:
            if not ev.get("supporting"):
                continue
            gid = f"doc:{ev['document_id']}"
            add_node(gid, ev["title"], "guideline", document_id=ev["document_id"], issuer=ev.get("issuer"),
                     is_synthetic=ev.get("is_synthetic"))
            edges.append({"id": f"e:ev:{c.id}:{ev['chunk_id']}", "source": gid, "target": cid,
                          "relation": "SUPPORTS", "data": {"score": ev.get("score")}})

    # De-duplicate edges by id
    uniq = {e["id"]: e for e in edges}
    return {"nodes": list(nodes.values()), "edges": list(uniq.values()),
            "stats": {"background_nodes": bg.size[0], "background_edges": bg.size[1]}}
