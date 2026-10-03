import asyncio
import base64
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app import models, schemas, alert_engine
from app.auth import get_current_user, get_detection_auth
from app.services.ws_manager import manager

router = APIRouter(tags=["alerts"])

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

_active_siren_tasks: dict[str, asyncio.Task] = {}


async def auto_turn_off_siren(zone_id: str, duration: int, db: Session | None = None):
    """
    Waits for siren_duration_seconds, sets Zone.siren_status = False,
    and broadcasts a 'siren_off' WebSocket event.
    """
    await asyncio.sleep(duration)
    should_close = False
    if db is None:
        from app.main import app
        if get_db in app.dependency_overrides:
            gen = app.dependency_overrides[get_db]()
            db = next(gen)
            should_close = False
        else:
            db = SessionLocal()
            should_close = True

    try:
        zone = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
        if zone and zone.siren_status:
            zone.siren_status = False
            db.commit()
            await manager.broadcast("siren_off", {"zone_id": zone_id, "siren_status": False})
    finally:
        if should_close:
            db.close()


def schedule_siren_auto_off(zone_id: str, duration: int) -> asyncio.Task:
    """Schedules auto_turn_off_siren in the running event loop as a background task."""
    if zone_id in _active_siren_tasks and not _active_siren_tasks[zone_id].done():
        _active_siren_tasks[zone_id].cancel()
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(auto_turn_off_siren(zone_id, duration))
    except RuntimeError:
        task = asyncio.ensure_future(auto_turn_off_siren(zone_id, duration))
    _active_siren_tasks[zone_id] = task
    return task


def _save_snapshot(base64_data: str) -> str:
    filename = f"{uuid.uuid4()}.jpg"
    path = os.path.join(SNAPSHOT_DIR, filename)
    with open(path, "wb") as f:
        f.write(base64.b64decode(base64_data))
    return f"/snapshots/{filename}"


@router.post("/detections", response_model=schemas.AlertOut | None)
async def ingest_detection(
    event: schemas.DetectionEvent,
    db: Session = Depends(get_db),
    _auth=Depends(get_detection_auth),
):
    """
    Called by ai-model/inference.py every time YOLO produces a detection above its own
    confidence floor. This is the single entry point that feeds app.alert_engine — the
    engine re-checks the zone's confidence threshold, cooldown, and class routing, so
    it's safe (and expected) for the AI side to send events somewhat liberally.
    """
    camera = db.query(models.Camera).filter(models.Camera.id == event.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    zone = db.query(models.Zone).filter(models.Zone.id == camera.zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone for camera not found")

    snapshot_path = event.snapshot_path
    if event.snapshot_base64 and not snapshot_path:
        snapshot_path = _save_snapshot(event.snapshot_base64)

    result = alert_engine.process_detection(
        db=db,
        camera=camera,
        zone=zone,
        event_type=event.event_type,
        confidence=event.confidence,
        snapshot_path=snapshot_path,
        species=event.species,
        movement_direction=event.movement_direction,
        boundary_crossing=event.boundary_crossing,
    )

    if result.alert:
        if result.alert.siren_activated:
            duration = zone.siren_duration_seconds or 45
            schedule_siren_auto_off(zone.id, duration)

        await manager.broadcast("new_alert", schemas.AlertOut.model_validate(result.alert).model_dump())
        return result.alert

    return None


@router.get("/alerts", response_model=list[schemas.AlertOut])
def list_alerts(
    zone_id: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(models.Alert).order_by(models.Alert.created_at.desc())
    if zone_id:
        q = q.filter(models.Alert.zone_id == zone_id)
    return q.limit(limit).all()


@router.post("/alerts/{alert_id}/resolve", response_model=schemas.AlertOut)
def resolve_alert(alert_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    db.commit()
    db.refresh(alert)
    return alert


@router.patch("/alerts/{alert_id}/read")
@router.post("/alerts/{alert_id}/read")
def toggle_alert_read(
    alert_id: str,
    read_in: schemas.AlertReadUpdate | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if read_in and read_in.read is not None:
        alert.read = read_in.read
    else:
        alert.read = not bool(alert.read)

    db.commit()
    db.refresh(alert)
    return {"id": alert.id, "read": alert.read, "status": "ok"}


@router.post("/alerts/mark-all-read")
def mark_all_alerts_read(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    count = db.query(models.Alert).filter(models.Alert.read == False).update({"read": True})
    db.commit()
    return {"updated": count, "status": "ok"}

