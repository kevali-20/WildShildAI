def test_register_and_login(client):
    # Register new operator
    reg_res = client.post(
        "/api/auth/register",
        json={"username": "ranger1", "password": "securepass123", "role": "operator"},
    )
    assert reg_res.status_code == 200
    data = reg_res.json()
    assert data["username"] == "ranger1"
    assert data["role"] == "operator"

    # Login with valid credentials
    login_res = client.post(
        "/api/auth/login",
        data={"username": "ranger1", "password": "securepass123"},
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"


def test_login_invalid_password(client):
    res = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "wrongpassword"},
    )
    assert res.status_code == 401
    assert "Incorrect" in res.json()["detail"]


def test_get_current_user_profile(client, auth_headers):
    # With auth headers
    res = client.get("/api/users/me", headers=auth_headers)
    assert res.status_code == 200
    profile = res.json()
    assert profile["username"] == "admin"
    assert profile["full_name"] == "Forest Officer"
    assert profile["email"] == "officer@wildshield.ai"
    assert profile["location"] == "Central Forest Command"
    assert profile["two_factor_enabled"] is True

    # Without auth headers
    unauth = client.get("/api/users/me")
    assert unauth.status_code == 401


def test_update_user_profile(client, auth_headers):
    update_payload = {
        "full_name": "Chief Ranger Woods",
        "email": "chief.ranger@wildshield.ai",
        "location": "North Outpost Alpha",
    }
    res = client.put("/api/users/me", json=update_payload, headers=auth_headers)
    assert res.status_code == 200
    updated = res.json()
    assert updated["full_name"] == "Chief Ranger Woods"
    assert updated["email"] == "chief.ranger@wildshield.ai"
    assert updated["location"] == "North Outpost Alpha"

    # Verify retrieval reflects updates
    get_res = client.get("/api/users/me", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["full_name"] == "Chief Ranger Woods"


def test_security_settings_and_toggle_2fa(client, auth_headers):
    # Get security settings
    sec_res = client.get("/api/security/settings", headers=auth_headers)
    assert sec_res.status_code == 200
    sec_data = sec_res.json()
    assert "two_factor_enabled" in sec_data
    assert "events" in sec_data
    initial_2fa = sec_data["two_factor_enabled"]

    # Toggle 2FA
    toggle_res = client.post("/api/security/toggle-2fa", headers=auth_headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json()["two_factor_enabled"] == (not initial_2fa)

    # Verify updated
    sec_res_2 = client.get("/api/security/settings", headers=auth_headers)
    assert sec_res_2.json()["two_factor_enabled"] == (not initial_2fa)
