def test_list_alerts_public(client):
    res = client.get("/api/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert isinstance(alerts, list)
    assert len(alerts) >= 2


def test_ingest_detection_and_alert_trigger(client):
    detection_payload = {
        "camera_id": "cam-1",
        "event_type": "ANIMAL_DETECTED",
        "confidence": 0.88,
        "species": "Tiger",
        "movement_direction": "South-East",
        "boundary_crossing": True,
    }
    res = client.post("/api/detections", json=detection_payload)
    assert res.status_code == 200
    alert = res.json()
    assert alert["species"] == "Tiger"
    assert alert["confidence"] == 0.88
    assert alert["siren_activated"] is True


def test_resolve_alert_auth(client, auth_headers):
    # Without auth: 401
    unauth = client.post("/api/alerts/alert-1/resolve")
    assert unauth.status_code == 401

    # With auth: 200
    res = client.post("/api/alerts/alert-1/resolve", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"


def test_alert_read_status_toggle(client, auth_headers):
    # Without auth: 401
    unauth = client.patch("/api/alerts/alert-1/read")
    assert unauth.status_code == 401

    # Toggle read status with auth
    toggle_1 = client.patch("/api/alerts/alert-1/read", headers=auth_headers)
    assert toggle_1.status_code == 200
    assert toggle_1.json()["read"] is True

    # Toggle back
    toggle_2 = client.patch("/api/alerts/alert-1/read", headers=auth_headers)
    assert toggle_2.status_code == 200
    assert toggle_2.json()["read"] is False

    # Explicit set to read: True
    explicit = client.patch(
        "/api/alerts/alert-1/read",
        json={"read": True},
        headers=auth_headers,
    )
    assert explicit.status_code == 200
    assert explicit.json()["read"] is True


def test_mark_all_alerts_read(client, auth_headers):
    # Unauth: 401
    unauth = client.post("/api/alerts/mark-all-read")
    assert unauth.status_code == 401

    # Mark all alerts read with auth
    res = client.post("/api/alerts/mark-all-read", headers=auth_headers)
    assert res.status_code == 200
    assert "updated" in res.json()

    # Verify all alerts in list have read=True
    alerts_res = client.get("/api/alerts")
    assert all(a["read"] is True for a in alerts_res.json())
