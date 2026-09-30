# hardware

Runs **on the field Raspberry Pi/Jetson itself**, not in Docker — these scripts need
direct GPIO and serial port access that a container on a cloud host won't have.

## Files
- `siren_controller.py` — drives the siren relay from a GPIO pin. `--test` for a wiring
  self-test, `--serve` to run as a local HTTP service the backend calls.
- `gsm_module.py` — sends SMS via a SIM800L/SIM7600 over serial AT commands. `--test
  <number>` for a one-off test, `--serve` to run as a local HTTP service.

## How this connects to the backend
`backend/app/services/hardware_service.py` and `sms_service.py` currently run in
**MOCK_MODE** (log-only, no real hardware calls) so the rest of the system is testable
without any physical device. Once you're wiring up the actual Pi:

1. Run `python siren_controller.py --serve` and `python gsm_module.py --serve` on the Pi.
2. In `backend/app/services/hardware_service.py`, set `MOCK_MODE = False`.
3. In `backend/.env`, set `SMS_PROVIDER=gsm_module` (or leave as `twilio`/`mock` if you're
   not using a physical GSM module for this deployment).

If the backend runs on the same Pi as the hardware, `localhost` URLs already used in
`hardware_service.py`/`sms_service.py` just work. If the backend runs elsewhere (a cloud
host), update `SIREN_CONTROLLER_URL` in `hardware_service.py` to the Pi's real address —
and make sure that address is reachable (VPN/Tailscale is the easiest way to do this
without exposing the Pi's control endpoints to the open internet).

## Power note (PRD risk register)
Field nodes should have battery/solar backup — an unattended camera that silently loses
power is worse than one that was never installed, since nobody notices. The backend's
camera heartbeat (`POST /api/cameras/{id}/heartbeat`, called periodically by
`ai-model/inference.py`) is what surfaces an offline camera on the dashboard.
