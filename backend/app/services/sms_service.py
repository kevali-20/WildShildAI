"""
SMS dispatch for authority notifications.

Three providers are supported, selected via SMS_PROVIDER in .env:
  - "mock"        : just logs to console — use during backend/dashboard development
  - "twilio"      : cloud SMS API — simplest if the deployment zone has stable data coverage
  - "gsm_module"  : posts to a small local HTTP endpoint exposed by hardware/gsm_module.py
                    running on the edge device's GSM-attached Pi — use for offline-capable
                    field deployments with no reliable internet at the zone itself.
"""
import logging

from app.config import settings

logger = logging.getLogger("wildshield.sms")


def send_sms(phone_numbers: list[str], message: str) -> bool:
    if not phone_numbers:
        logger.warning("send_sms called with no recipients")
        return False

    if settings.sms_provider == "twilio":
        return _send_via_twilio(phone_numbers, message)
    elif settings.sms_provider == "gsm_module":
        return _send_via_gsm_module(phone_numbers, message)
    else:
        return _send_mock(phone_numbers, message)


def _send_mock(phone_numbers: list[str], message: str) -> bool:
    logger.info(f"[MOCK SMS] to={phone_numbers} message={message!r}")
    return True


def _send_via_twilio(phone_numbers: list[str], message: str) -> bool:
    try:
        from twilio.rest import Client
    except ImportError:
        logger.error("twilio package not installed — pip install twilio")
        return False

    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number):
        logger.error("Twilio credentials missing in .env")
        return False

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    ok = True
    for number in phone_numbers:
        try:
            client.messages.create(body=message, from_=settings.twilio_from_number, to=number)
        except Exception as e:
            logger.error(f"Twilio send failed for {number}: {e}")
            ok = False
    return ok


def _send_via_gsm_module(phone_numbers: list[str], message: str) -> bool:
    """
    Calls the local GSM control service (hardware/gsm_module.py --serve) which speaks
    AT commands to a SIM800L/SIM7600 attached to the field Raspberry Pi over serial.
    """
    import requests

    ok = True
    for number in phone_numbers:
        try:
            resp = requests.post(
                "http://localhost:8765/send_sms",
                json={"to": number, "message": message},
                timeout=15,
            )
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"GSM module send failed for {number}: {e}")
            ok = False
    return ok


def alert_message(zone_name: str, event_type: str, confidence: float, timestamp: str) -> str:
    return (
        f"WildShield-AI Alert\n"
        f"Zone: {zone_name}\n"
        f"Event: {event_type}\n"
        f"Confidence: {confidence:.0%}\n"
        f"Time: {timestamp}"
    )
