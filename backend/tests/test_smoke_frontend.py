def test_frontend_page_hooks_smoke(client, auth_headers):
    """
    Verifies that all API endpoints driving data-role hooks across all 8 frontend
    pages return valid HTTP 200 responses with the exact properties expected by script.js.
    """

    # 1. index.html hooks
    # /villages -> data-role="village-grid", data-role="index-map-details"
    res_villages = client.get("/api/villages")
    assert res_villages.status_code == 200
    villages = res_villages.json()
    assert len(villages) > 0
    assert all("id" in v and "status" in v for v in villages)

    # /detections -> data-role="live-feed", data-role="detections-table",
    #                data-role="index-overview", data-role="index-intrusion-badge"
    res_detections = client.get("/api/detections")
    assert res_detections.status_code == 200
    detections = res_detections.json()
    assert len(detections) > 0
    assert all("id" in d and "species" in d and "type" in d for d in detections)

    # /active-alerts -> data-role="index-active-alert", data-role="index-gauge-fill"
    res_alerts = client.get("/api/active-alerts")
    assert res_alerts.status_code == 200
    alerts = res_alerts.json()
    assert len(alerts) > 0
    assert all("id" in a and "title" in a and "riskLevel" in a for a in alerts)

    # 2. map-view.html hooks
    # /map-data -> data-role="map-threat"
    res_map = client.get("/api/map-data")
    assert res_map.status_code == 200
    map_data = res_map.json()
    assert "threat" in map_data and "zones" in map_data

    # /sirens -> data-role="map-siren-1", data-role="map-siren-2"
    res_sirens = client.get("/api/sirens")
    assert res_sirens.status_code == 200
    sirens = res_sirens.json()
    assert len(sirens) > 0
    assert all("currentStatus" in s and "zoneStatus" in s for s in sirens)

    # 3. alerts.html hooks
    # data-role="alert-list"
    assert len(alerts) > 0
    assert all("status" in a for a in alerts)

    # 4. siren-control.html hooks
    # data-role="siren-grid", data-role="siren-history-time", data-role="siren-history-reason"
    assert len(sirens) > 0
    assert any("village" in s for s in sirens)

    # 5. analytics.html hooks
    # /analytics -> data-role="analytics-species", data-role="analytics-wildlife-trend",
    #               data-role="analytics-human-trend", data-role="analytics-risk-donut",
    #               data-role="analytics-directions", data-role="analytics-siren-history",
    #               data-role="analytics-metrics"
    res_analytics = client.get("/api/analytics")
    assert res_analytics.status_code == 200
    analytics = res_analytics.json()
    assert len(analytics["speciesCounts"]) > 0
    assert len(analytics["wildlifeIntrusions"]) == 6
    assert len(analytics["humanIntrusions"]) == 6
    assert len(analytics["riskLevels"]) == 4
    assert len(analytics["sirenActivations"]) == 6

    # 6. notifications.html hooks
    # data-role="notifications-list"
    assert all("read" in a for a in alerts)

    # 7. profile.html hooks
    # /users/me -> data-role="edit-profile-btn"
    res_profile = client.get("/api/users/me", headers=auth_headers)
    assert res_profile.status_code == 200
    profile = res_profile.json()
    assert "full_name" in profile
    assert "email" in profile
    assert "location" in profile

    # 8. security.html hooks
    # /security/settings -> data-role="two-factor-status", data-role="devices-count",
    #                       data-role="last-login-time", data-role="security-events"
    res_sec = client.get("/api/security/settings", headers=auth_headers)
    assert res_sec.status_code == 200
    sec = res_sec.json()
    assert "two_factor_enabled" in sec
    assert "authorized_devices_count" in sec
    assert len(sec["events"]) > 0
