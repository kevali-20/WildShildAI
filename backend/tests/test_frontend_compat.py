def test_get_detections(client):
    res = client.get("/api/detections")
    assert res.status_code == 200
    detections = res.json()
    assert isinstance(detections, list)
    assert len(detections) >= 2
    d = detections[0]
    assert "id" in d
    assert "type" in d
    assert "species" in d
    assert "confidence" in d
    assert "location" in d
    assert "riskLevel" in d
    assert "sirenStatus" in d
    assert "timestamp" in d


def test_get_active_alerts(client):
    res = client.get("/api/active-alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert isinstance(alerts, list)
    assert len(alerts) >= 2
    a = alerts[0]
    assert "id" in a
    assert "title" in a
    assert "riskLevel" in a
    assert "status" in a
    assert "detectedObject" in a
    assert "location" in a
    assert "zone" in a
    assert "village" in a
    assert "read" in a
    assert "recipients" in a


def test_get_villages(client):
    res = client.get("/api/villages")
    assert res.status_code == 200
    villages = res.json()
    assert isinstance(villages, list)
    assert len(villages) >= 3
    v = villages[0]
    assert "id" in v
    assert "name" in v
    assert "zone" in v
    assert "status" in v
    assert "sirenId" in v
    assert "sirenStatus" in v


def test_get_map_data(client):
    res = client.get("/api/map-data")
    assert res.status_code == 200
    data = res.json()
    assert "threat" in data
    assert "zones" in data
    threat = data["threat"]
    assert "animal" in threat
    assert "confidence" in threat
    assert "currentLocation" in threat
    assert "riskLevel" in threat
    assert "siren" in threat


def test_get_analytics(client):
    res = client.get("/api/analytics")
    assert res.status_code == 200
    analytics = res.json()
    assert "speciesCounts" in analytics
    assert "wildlifeIntrusions" in analytics
    assert "humanIntrusions" in analytics
    assert "riskLevels" in analytics
    assert "movementDirections" in analytics
    assert "sirenActivations" in analytics
    assert "falseAlarmStats" in analytics
    assert "falseAlarms" in analytics["falseAlarmStats"]
    assert "confirmedIntrusions" in analytics["falseAlarmStats"]
