from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import require_admin, get_current_user

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.post("", response_model=schemas.ContactOut)
def create_contact(contact_in: schemas.ContactCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    contact = models.Contact(
        name=contact_in.name, phone_number=contact_in.phone_number, role=contact_in.role
    )
    db.add(contact)
    db.flush()  # get contact.id before linking zones

    for zone_id in contact_in.zone_ids:
        zone = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
        if not zone:
            raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")
        db.add(models.ZoneContact(zone_id=zone_id, contact_id=contact.id))

    db.commit()
    db.refresh(contact)
    return contact


@router.get("", response_model=list[schemas.ContactOut])
def list_contacts(db: Session = Depends(get_db)):
    return db.query(models.Contact).all()


@router.delete("/{contact_id}")
def delete_contact(contact_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"deleted": contact_id}
