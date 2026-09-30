def test_get_sirens_public(client):
    res = client.get("/api/sirens")
    assert res.status_code == 200
    sirens = res.json()
    assert isinstance(sirens, list)
    assert len(sirens) >= 2
    for s in sirens:
        assert "id" in s
        assert "currentStatus" in s
        assert "zoneStatus" in s
        assert "village" in s


def test_activate_siren_auth_required(client, auth_headers):
    # Unauthenticated request must fail with 401
    unauth = client.post("/api/sirens/zone-2/activate")
    assert unauth.status_code == 401

    # Authenticated request succeeds
    res = client.post("/api/sirens/zone-2/activate", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["currentStatus"] == "on"
    assert data["zoneStatus"] == "At Risk"


def test_deactivate_siren_auth_required(client, auth_headers):
    # Unauthenticated request must fail with 401
    unauth = client.post("/api/sirens/zone-1/deactivate")
    assert unauth.status_code == 401

    # Authenticated request succeeds
    res = client.post("/api/sirens/zone-1/deactivate", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["currentStatus"] == "off"
    assert data["zoneStatus"] == "Safe"


def test_siren_not_found(client, auth_headers):
    res = client.post("/api/sirens/non-existent-zone/activate", headers=auth_headers)
    assert res.status_code == 404
