import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app import models, auth


# In-memory SQLite database for isolated test execution
TEST_SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # Seed minimal test data
    now = datetime.utcnow()
    zone1 = models.Zone(
        id="zone-1",
        name="Village 1 — Zone A",
        type=models.ZoneType.ANIMAL,
        latitude=11.685,
        longitude=76.620,
        confidence_threshold=0.6,
        siren_status=True,
        siren_activated_at=now - timedelta(minutes=15),
        siren_reason="Lion moving toward Village 1",
    )
    zone2 = models.Zone(
        id="zone-2",
        name="Village 2 — Zone B",
        type=models.ZoneType.ANIMAL,
        latitude=11.692,
        longitude=76.635,
        confidence_threshold=0.6,
        siren_status=False,
        siren_reason="No active threat",
    )
    zone3 = models.Zone(
        id="zone-3",
        name="Core Reserve — Zone C",
        type=models.ZoneType.RESTRICTED,
        latitude=11.678,
        longitude=76.610,
        confidence_threshold=0.65,
        siren_status=False,
    )
    session.add_all([zone1, zone2, zone3])
    session.flush()

    cam1 = models.Camera(id="cam-1", zone_id=zone1.id, name="North Ridge Cam", is_online=True)
    cam2 = models.Camera(id="cam-2", zone_id=zone2.id, name="Riverline Cam", is_online=True)
    session.add_all([cam1, cam2])
    session.flush()

    user = models.User(
        id="user-admin",
        username="admin",
        hashed_password=auth.hash_password("changeme123"),
        role=models.UserRole.ADMIN,
        full_name="Forest Officer",
        email="officer@wildshield.ai",
        location="Central Forest Command",
        two_factor_enabled=True,
        last_login_at=now,
    )
    session.add(user)
    session.flush()

    alert1 = models.Alert(
        id="alert-1",
        zone_id=zone1.id,
        camera_id=cam1.id,
        event_type=models.EventType.ANIMAL_DETECTED,
        confidence=0.95,
        species="Lion",
        movement_direction="South-East",
        boundary_crossing=True,
        risk_level="critical",
        status="active",
        siren_activated=True,
        sms_sent=True,
        read=False,
        title="Lion movement near boundary",
        created_at=now - timedelta(minutes=15),
    )
    alert2 = models.Alert(
        id="alert-2",
        zone_id=zone2.id,
        camera_id=cam2.id,
        event_type=models.EventType.PERSON_DETECTED,
        confidence=0.92,
        species="Human",
        movement_direction="North",
        boundary_crossing=False,
        risk_level="medium",
        status="resolved",
        siren_activated=False,
        sms_sent=True,
        read=True,
        title="Human activity detected",
        created_at=now - timedelta(hours=3),
    )
    session.add_all([alert1, alert2])
    session.commit()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "changeme123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
