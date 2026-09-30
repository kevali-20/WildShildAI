from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import require_admin, get_current_user

router = APIRouter(prefix="/cameras", tags=["cameras"])


@router.post("", response_model=schemas.CameraOut)
def create_camera(camera_in: schemas.CameraCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    zone = db.query(models.Zone).filter(models.Zone.id == camera_in.zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    camera = models.Camera(**camera_in.model_dump())
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera


@router.get("", response_model=list[schemas.CameraOut])
def list_cameras(zone_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Camera)
    if zone_id:
        q = q.filter(models.Camera.zone_id == zone_id)
    return q.all()


@router.post("/{camera_id}/heartbeat", response_model=schemas.CameraOut)
def heartbeat(camera_id: str, hb: schemas.CameraHeartbeat, db: Session = Depends(get_db)):
    """
    Called periodically by ai-model/inference.py (or any edge agent) so the dashboard
    knows the camera is alive. No auth required — edge devices authenticate via a
    per-camera API key in production; kept open here for scaffold simplicity.
    """
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    camera.is_online = hb.is_online
    camera.last_heartbeat = datetime.utcnow()
    db.commit()
    db.refresh(camera)
    return camera
