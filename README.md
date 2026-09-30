# WildShield-AI — Project Scaffold

AI-powered early warning system for human–wildlife conflict zones. This picks up from
your existing dashboard UI and PRD, and adds everything needed to make it real:

```
wildshield-ai/
├── backend/       FastAPI service — zones, cameras, alerts, trigger logic, SMS + siren hooks,
│                   plus a compatibility layer that serves your existing frontend's exact API shape
├── frontend/       Your existing dashboard (index.html, alerts.html, siren-control.html, etc.)
│                   — unmodified except api-service.js now points at the real backend
├── ai-model/       YOLOv8 training + real-time inference scripts
├── hardware/       Raspberry Pi siren relay + GSM (SIM800L) control scripts
└── docker-compose.yml   Runs backend + Postgres + a static file server for the frontend
```

## What changed from your uploaded frontend
Nothing in the HTML/CSS. The only edit is in `frontend/api-service.js`: `useMock` is now
`false` and `baseUrl` points at `http://localhost:8000/api`. Every function your pages
already call (`getDetections`, `getActiveAlerts`, `getVillages`, `getSirens`,
`getMapData`, `getAnalytics`, `activateSiren`, `deactivateSiren`) is now backed by a real
endpoint in `backend/app/routers/frontend_compat.py` that returns data in the exact same
shape the old mock did — your pages should render real data with zero further changes.

Internally, "village" in your UI maps to a `Zone`, and each zone's siren state lives on
that same `Zone` row — there's one real data model (`backend/app/models.py`, matching the
PRD) and the compat layer just translates it into the shape your pages expect.

## Quick start

### 1. Backend
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed          # creates demo zones/cameras/contacts + admin login (admin / changeme123)
uvicorn app.main:app --reload --port 8000
```
API docs: `http://localhost:8000/docs`. Defaults to SQLite — zero external setup needed
to try it locally.

### 2. Frontend (your existing dashboard)
```bash
cd frontend
python3 -m http.server 5173
```
Open `http://localhost:5173`. It will now call the backend directly. Set `useMock: true`
in `api-service.js` any time you want to demo with canned data, no backend required.

### 3. See it update with fake detections (no camera/model needed yet)
```bash
cd backend
python scripts/simulate_detection.py --zone-type animal        # siren + SMS path
python scripts/simulate_detection.py --zone-type restricted    # SMS-only path
```
Refresh the dashboard — the new alert/detection should show up.

### 4. AI model (once you have a labeled dataset)
```bash
cd ai-model
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python train.py --data data/data.yaml --epochs 100
python inference.py --weights runs/detect/train/weights/best.pt --source 0 \
    --camera-id <camera_id from /api/cameras> --backend http://localhost:8000
```

### 5. Hardware (on the Raspberry Pi in the field)
```bash
cd hardware
pip install -r requirements.txt
python siren_controller.py --test
python gsm_module.py --test "+911234567890"
```

### Everything together
```bash
docker-compose up --build
```

## How the pieces connect
```
Camera → ai-model/inference.py → POST /api/detections → alert_engine decides the response
                                                            ├─ siren  → hardware/siren_controller.py
                                                            └─ SMS    → hardware/gsm_module.py or Twilio
                                                        → frontend polls /api/* (your existing pages)
```

## What's still simplified (be aware before you present this as "done")
- **Species classification**: the base model only distinguishes animal vs. person. Your
  UI shows specific species (`Elephant`, `Lion`, etc.) — `inference.py` passes whatever
  class name your trained model predicts through as `species`, so this becomes accurate
  once you train on real species classes (see `ai-model/README.md`).
- **Movement direction / distance-to-village**: these need a multi-frame tracker
  (e.g. ByteTrack) or a second camera for triangulation. Currently defaulted/omitted —
  flagged with `TODO` comments in `frontend_compat.py` and `inference.py`.
- **Auth on the dashboard**: `frontend_compat.py` endpoints are unauthenticated so your
  existing pages (which don't send a login token yet) work as-is. `profile.html` /
  `security.html` are the natural place to wire up `POST /api/auth/login` when you're
  ready to lock this down.
- **Siren auto-deactivation**: the backend tracks siren state but the physical relay's
  own auto-shutoff timer (in `hardware/siren_controller.py`) doesn't yet report back to
  clear `Zone.siren_status` in the database — worth adding before a real field test so
  the dashboard doesn't show a siren as "on" after it's physically turned itself off.

## Build order (matches the PRD roadmap)
1. **Backend** — already scaffolded and wired to your frontend's expected shape.
2. **Simulate detections** (`scripts/simulate_detection.py`) to confirm the whole
   pipeline — alert routing, siren state, SMS mock — works before touching a camera.
3. **AI model** — train on your real dataset, swap `inference.py` in for the simulator.
4. **Hardware** — wire the physical siren + GSM module, flip `MOCK_MODE = False` in
   `backend/app/services/hardware_service.py` and `SMS_PROVIDER` in `.env`.

Each folder has its own README with more detail.
