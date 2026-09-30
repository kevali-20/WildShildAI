"""
Implements PRD section 12: alert trigger logic.

  ANIMAL zone + ANIMAL_DETECTED  -> siren + SMS
  RESTRICTED zone + PERSON_DETECTED -> SMS only (no siren, discreet response)

Everything else (wrong event type for the zone, confidence below threshold, or camera
still in cooldown) is silently ignored — this is intentional, not an error.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.services import sms_service, hardware_service

logger = logging.getLogger("wildshield.alert_engine")


class AlertResult:
    def __init__(self, alert: models.Alert | None, reason: str):
        self.alert = alert
        self.reason = reason  # "triggered" | "below_threshold" | "cooldown" | "class_mismatch"


def _in_cooldown(camera: models.Camera, cooldown_seconds: int) -> bool:
    if not camera.last_alert_at:
        return False
    return datetime.utcnow() < camera.last_alert_at + timedelta(seconds=cooldown_seconds)


def _class_matches_zone(zone_type: models.ZoneType, event_type: models.EventType) -> bool:
    if zone_type == models.ZoneType.ANIMAL:
        return event_type == models.EventType.ANIMAL_DETECTED
    if zone_type == models.ZoneType.RESTRICTED:
        return event_type == models.EventType.PERSON_DETECTED
    return False


def _risk_level(confidence: float, boundary_crossing: bool) -> str:
    if confidence >= 0.9 or boundary_crossing:
        return "critical" if confidence >= 0.9 else "high"
    if confidence >= 0.75:
        return "high"
    if confidence >= 0.5:
        return "medium"
    return "low"


def _title(event_type: models.EventType, species: str | None, zone_name: str) -> str:
    if event_type == models.EventType.PERSON_DETECTED:
        return f"Human activity detected — {zone_name}"
    label = species or "Animal"
    return f"{label} movement detected — {zone_name}"


def process_detection(
    db: Session,
    camera: models.Camera,
    zone: models.Zone,
    event_type: models.EventType,
    confidence: float,
    snapshot_path: str | None,
    species: str | None = None,
    movement_direction: str | None = None,
    boundary_crossing: bool = False,
) -> AlertResult:
    if not _class_matches_zone(zone.type, event_type):
        logger.info(f"Ignoring {event_type} in {zone.type} zone {zone.id} (wrong class for zone)")
        return AlertResult(None, "class_mismatch")

    if confidence < zone.confidence_threshold:
        logger.info(f"Ignoring low-confidence detection ({confidence:.2f} < {zone.confidence_threshold})")
        return AlertResult(None, "below_threshold")

    if _in_cooldown(camera, zone.cooldown_seconds):
        logger.info(f"Camera {camera.id} in cooldown — suppressing duplicate alert")
        return AlertResult(None, "cooldown")

    alert = models.Alert(
        zone_id=zone.id,
        camera_id=camera.id,
        event_type=event_type,
        confidence=confidence,
        snapshot_path=snapshot_path,
        species=species,
        movement_direction=movement_direction,
        boundary_crossing=boundary_crossing,
        risk_level=_risk_level(confidence, boundary_crossing),
        title=_title(event_type, species, zone.name),
        status="active",
    )
    db.add(alert)

    contact_numbers = [zc.contact.phone_number for zc in zone.contacts]
    message = sms_service.alert_message(
        zone.name, event_type.value, confidence, datetime.utcnow().isoformat()
    )

    if zone.type == models.ZoneType.ANIMAL:
        alert.siren_activated = hardware_service.activate_siren(zone.id, zone.siren_duration_seconds)
        alert.sms_sent = sms_service.send_sms(contact_numbers, message)
        zone.siren_status = alert.siren_activated
        zone.siren_activated_at = datetime.utcnow()
        zone.siren_reason = alert.title
    elif zone.type == models.ZoneType.RESTRICTED:
        alert.siren_activated = False  # explicitly never triggered — discreet response only
        alert.sms_sent = sms_service.send_sms(contact_numbers, message)

    camera.last_alert_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)

    return AlertResult(alert, "triggered")
