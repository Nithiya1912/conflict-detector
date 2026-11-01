import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("LLM_PROVIDER", "none")


@pytest.fixture(scope="session")
def app_client(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("db") / "test.db"
    from app import database

    database.configure_engine(f"sqlite:///{db_path.as_posix()}")
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        yield client


def login(client, email="clinician@cicd.demo", password="Clinician#2026demo"):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": email, "password": password}, headers={"X-Requested-With": "cicd"})
    assert r.status_code == 200, r.text
    return client


H = {"X-Requested-With": "cicd"}
