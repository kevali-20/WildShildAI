import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Enum, Text
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id():
    return str(uuid.uuid4())


class ZoneType(str, enum.Enum):
    ANIMAL = "ANIMAL"
    RESTRICTED = "RESTRICTED"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    OPERATOR = "operator"


class EventType(str, enum.Enum):
    ANIMAL_DETECTED = "ANIMAL_DETECTED"
    PERSON_DETECTED = "PERSON_DETECTED"


class Zone(Base):
    __tablename__ = "zones"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    type = Column(Enum(ZoneType), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    confidence_threshold = Column(Float, default=0.6)
    cooldown_seconds = Column(Integer, default=90)
    siren_duration_seconds = Column(Integer, default=45)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Current siren state for this zone — used by the /sirens compat endpoints and by
    # the dashboard's siren-control page. Updated both by auto-triggers (alert_engine)
    # and by manual operator activate/deactivate calls.
    siren_status = Column(Boolean, default=False)
    siren_activated_at = Column(DateTime, nullable=True)
    siren_reason = Column(String, default="No active threat")

    cameras = relationship("Camera", back_populates="zone", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="zone", cascade="all, delete-orphan")
    contacts = relationship("ZoneContact", back_populates="zone", cascade="all, delete-orphan")


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, default=gen_id)
    zone_id = Column(String, ForeignKey("zones.id"), nullable=False)
    name = Column(String, nullable=False)
    stream_source = Column(String, nullable=True)  # RTSP URL / device index
    is_online = Column(Boolean, default=False)
    last_heartbeat = Column(DateTime, nullable=True)
    last_alert_at = Column(DateTime, nullable=True)  # used for cooldown checks

    zone = relationship("Zone", back_populates="cameras")
    alerts = relationship("Alert", back_populates="camera")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=gen_id)
    zone_id = Column(String, ForeignKey("zones.id"), nullable=False)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    event_type = Column(Enum(EventType), nullable=False)
    confidence = Column(Float, nullable=False)
    snapshot_path = Column(String, nullable=True)
    siren_activated = Column(Boolean, default=False)
    sms_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Extra descriptive fields the dashboard displays. species/movement_direction are
    # optional because the base YOLO model only distinguishes ANIMAL vs PERSON — fill
    # these in once a species-classification head or a tracking step is added (see PRD
    # "Future Enhancements"). Until then the ingestion endpoint defaults sensibly.
    species = Column(String, nullable=True)
    movement_direction = Column(String, nullable=True)
    boundary_crossing = Column(Boolean, default=False)
    risk_level = Column(String, default="medium")  # low | medium | high | critical
    status = Column(String, default="active")  # active | resolved
    title = Column(String, nullable=True)
    read = Column(Boolean, default=False)

    zone = relationship("Zone", back_populates="alerts")
    camera = relationship("Camera", back_populates="alerts")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    role = Column(String, default="authority")

    zones = relationship("ZoneContact", back_populates="contact", cascade="all, delete-orphan")


class ZoneContact(Base):
    """Many-to-many: which contacts get notified for which zones."""
    __tablename__ = "zone_contacts"

    id = Column(String, primary_key=True, default=gen_id)
    zone_id = Column(String, ForeignKey("zones.id"), nullable=False)
    contact_id = Column(String, ForeignKey("contacts.id"), nullable=False)

    zone = relationship("Zone", back_populates="contacts")
    contact = relationship("Contact", back_populates="zones")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.OPERATOR)
    full_name = Column(String, default="Forest Officer")
    email = Column(String, default="officer@wildshield.ai")
    location = Column(String, default="Central Forest Command")
    two_factor_enabled = Column(Boolean, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

