from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.cameras import compute_camera_online

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=dict)
def health_status():
    return {"status": "healthy"}


@router.get("/summary", response_model=schemas.HealthSummaryOut)
def health_summary(db: Session = Depends(get_db)):
    """
    Returns system health summary:
    - cameras online / total  (online = heartbeat received within last 90 s)
    - active alerts count
    - sirens currently on
    - last detection time (ISO format)
    """
    cameras = db.query(models.Camera).all()
    cameras_total = len(cameras)
    # Recompute online status at read time — consistent with GET /api/cameras
    cameras_online = sum(1 for c in cameras if compute_camera_online(c))

    active_alerts = db.query(models.Alert).filter(models.Alert.status == "active").count()
    sirens_on = db.query(models.Zone).filter(models.Zone.siren_status == True).count()

    latest_alert = db.query(models.Alert).order_by(models.Alert.created_at.desc()).first()
    last_detection_time = (
        latest_alert.created_at.isoformat()
        if latest_alert and latest_alert.created_at
        else None
    )

    return schemas.HealthSummaryOut(
        cameras_online=cameras_online,
        cameras_total=cameras_total,
        cameras=f"{cameras_online}/{cameras_total}",
        active_alerts=active_alerts,
        sirens_on=sirens_on,
        last_detection_time=last_detection_time,
    )
