import time

from .conftest import H, login


def wait_run(client, run_id, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/runs/{run_id}").json()
        if r["status"] in ("completed", "failed", "cancelled"):
            return r
        time.sleep(0.1)
    raise AssertionError("run did not finish")


def test_auth_required_and_csrf(app_client):
    app_client.cookies.clear()
    assert app_client.get("/api/cases").status_code == 401
    r = app_client.post("/api/auth/login", json={"email": "clinician@cicd.demo", "password": "Clinician#2026demo"})
    assert r.status_code == 403  # missing CSRF header


def test_login_failure_and_password_not_stored_plain(app_client):
    app_client.cookies.clear()
    r = app_client.post("/api/auth/login", json={"email": "clinician@cicd.demo", "password": "wrong"}, headers=H)
    assert r.status_code == 401
    from app import database, models
    with database.SessionLocal() as db:
        u = db.query(models.User).filter_by(email="clinician@cicd.demo").one()
        assert u.password_hash.startswith("scrypt$") and "Clinician#2026demo" not in u.password_hash


def test_register_validates_password(app_client):
    app_client.cookies.clear()
    r = app_client.post("/api/auth/register", json={"email": "new@x.org", "full_name": "New User", "password": "short"}, headers=H)
    assert r.status_code == 422
    r = app_client.post("/api/auth/register", json={"email": "new@x.org", "full_name": "New User", "password": "LongEnough123"}, headers=H)
    assert r.status_code == 201 and r.json()["role"] == "clinician"


def test_seeded_dashboard_comes_from_db(app_client):
    login(app_client)
    d = app_client.get("/api/dashboard").json()
    assert d["cards"]["total_cases"] == 7
    assert d["cards"]["cases_analyzed"] == 6
    assert d["cards"]["conflicts"] == sum(x["count"] for x in d["severity_distribution"])
    assert "Synthetic" in d["data_label"]


def test_full_analysis_workflow_and_review(app_client):
    login(app_client)
    case = app_client.post("/api/cases", json={"pseudonym": "Patient Test-99", "summary": "pytest"}, headers=H).json()
    cid = case["id"]
    r = app_client.post(f"/api/cases/{cid}/analyze", json={}, headers=H)
    assert r.status_code == 422  # needs two notes
    for spec, txt in (("Cardiology", "Continue warfarin 5 mg once daily."), ("Orthopaedics", "Start ibuprofen 400 mg three times daily.")):
        r = app_client.post(f"/api/cases/{cid}/notes", json={"specialist_name": "Dr. T", "specialty": spec, "title": spec, "content": txt}, headers=H)
        assert r.status_code == 201 and r.json()["instruction_count"] >= 1
    run = app_client.post(f"/api/cases/{cid}/analyze", json={}, headers=H).json()
    done = wait_run(app_client, run["id"])
    assert done["status"] == "completed", done
    assert [s["status"] for s in done["stages"]] == ["done"] * 8
    conflicts = done["conflicts"]
    assert any(c["category"] == "Drug–Drug" and c["severity"] == "high" for c in conflicts)
    c = conflicts[0]
    # rejection requires a reason
    assert app_client.post(f"/api/conflicts/{c['id']}/review", json={"decision": "rejected"}, headers=H).status_code == 422
    r = app_client.post(f"/api/conflicts/{c['id']}/review", json={"decision": "confirmed", "comment": "ok"}, headers=H)
    assert r.status_code == 200 and r.json()["validation_status"] == "confirmed"
    # cannot overwrite; must reopen; history preserved
    assert app_client.post(f"/api/conflicts/{c['id']}/review", json={"decision": "rejected", "reason": "Other"}, headers=H).status_code == 409
    r = app_client.post(f"/api/conflicts/{c['id']}/reopen", json={"comment": "second look"}, headers=H)
    assert r.status_code == 200 and len(r.json()["reviews"]) == 2
    # re-run keeps reviewed findings and does not duplicate them
    app_client.post(f"/api/conflicts/{c['id']}/review", json={"decision": "confirmed"}, headers=H)
    run2 = wait_run(app_client, app_client.post(f"/api/cases/{cid}/analyze", json={}, headers=H).json()["id"])
    detail = app_client.get(f"/api/cases/{cid}").json()
    assert sum(1 for x in detail["conflicts"] if x["title"] == c["title"]) == 1
    assert run2["status"] == "completed"
    # report snapshot
    rep = app_client.post("/api/reports", json={"case_id": cid}, headers=H).json()
    assert rep["content"]["summary"]["findings"] == len(detail["conflicts"])


def test_instruction_correction_is_preserved(app_client):
    login(app_client)
    detail = app_client.get("/api/cases/CASE-1004").json()
    ins = detail["notes"][0]["instructions"][0]
    r = app_client.patch(f"/api/instructions/{ins['id']}", json={"timing": "bedtime"}, headers=H)
    assert r.status_code == 200 and r.json()["corrected"] and r.json()["confidence"] == 1.0
    note = app_client.post(f"/api/notes/{ins['note_id']}/extract", headers=H).json()
    assert any(i["id"] == ins["id"] and i["timing"] == "bedtime" for i in note["instructions"])


def test_test_sessions_and_evaluation(app_client):
    login(app_client)
    r = app_client.post("/api/test-sessions/run", json={}, headers=H).json()
    assert len(r["ran"]) == 20
    s = r["summary"]
    assert s["executed"] == 20 and s["pass"] + s["fail"] + s["needs_review"] == 20
    assert s["fail"] >= 1  # TS-20 documents a known limitation
    ev = app_client.post("/api/evaluation/run", headers=H).json()
    assert set(ev["results"]) == {"single_document", "no_kg", "no_rag", "full"}
    assert ev["results"]["single_document"]["recall"] < ev["results"]["full"]["recall"]
    assert app_client.get("/api/test-sessions/export?fmt=csv").text.startswith("id,title")


def test_admin_only_endpoints(app_client):
    login(app_client)
    assert app_client.put("/api/settings/policy", json={"cap_ambiguous_at": "low"}, headers=H).status_code == 403
    login(app_client, "admin@cicd.demo", "Admin#2026demo")
    r = app_client.put("/api/settings/policy", json={"confidence_weights": {"extraction": 0.5, "rule_match": 0.5, "evidence": 0.5}}, headers=H)
    assert r.status_code == 422
    assert app_client.put("/api/settings/policy", json={"cap_ambiguous_at": "low"}, headers=H).json()["cap_ambiguous_at"] == "low"
    app_client.delete("/api/settings/policy", headers=H)


def test_graph_and_search(app_client):
    login(app_client)
    g = app_client.get("/api/graph?case_id=CASE-1001").json()
    types = {n["type"] for n in g["nodes"]}
    assert {"note", "medication", "diet", "class", "conflict"} <= types
    assert any(e["relation"] == "TRIGGERS" for e in g["edges"])
    res = app_client.post("/api/guidelines/search", json={"query": "warfarin vitamin k"}, headers=H).json()
    assert res["results"] and res["results"][0]["is_synthetic"]


def test_diet_plan_lifecycle_and_compare(app_client):
    login(app_client)
    plans = app_client.get("/api/diet-plans?case_id=CASE-1003").json()
    pid = plans[0]["id"]
    cmp = app_client.get(f"/api/diet-plans/{pid}/compare").json()
    assert any(f["rule_id"] == "R-DF-02" for f in cmp["findings"])  # grapefruit snack vs simvastatin
    r = app_client.patch(f"/api/diet-plans/{pid}", json={"nutrition_notes": "Regular meals, no fasting."}, headers=H).json()
    assert r["version"] == plans[0]["version"] + 1 and r["status"] == "draft"
