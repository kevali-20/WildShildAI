# ai-model

YOLOv8 training and real-time inference for WildShield-AI, per PRD section 10.

## Status
This folder is a **runnable skeleton, not a trained model** — `data/train` and
`data/val` are empty. Nothing will detect anything until you:

1. Collect/annotate a dataset (see PRD 10.1–10.2) and drop it into `data/train/`
   and `data/val/` in YOLO format (one `.txt` label file per image, same basename).
2. Adjust `data/data.yaml`'s class list to your actual priority species.
3. Run `python train.py --data data/data.yaml --epochs 100`.
4. Point `inference.py` at the resulting `best.pt`.

## Files
- `train.py` — fine-tunes a pretrained YOLOv8 checkpoint on your dataset (transfer learning).
- `inference.py` — runs the trained model on a live camera/RTSP/video file and POSTs
  detections to the backend's `/api/detections` endpoint. This is the bridge between
  the AI side and the alert-trigger logic in `backend/app/alert_engine.py`.
- `data/data.yaml` — dataset + class config, Ultralytics format.

## Getting a camera ID to pass to inference.py
Cameras are registered via the backend, not by this script:
```bash
curl -X POST http://localhost:8000/api/cameras \
  -H "Authorization: Bearer <admin token>" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "<zone id>", "name": "North Ridge Trail Cam", "stream_source": "0"}'
```
Or just use the camera IDs created by `backend/app/seed.py` for local testing.

## Two-model vs. one-model (PRD 10.3)
`data/data.yaml` currently defines a single combined class list (animals + person).
`inference.py` reads the predicted class name and maps it to `ANIMAL_DETECTED` or
`PERSON_DETECTED` before sending it on — the backend doesn't care whether that came from
one multi-class model or two separate ones. If edge hardware struggles with the combined
model's size, split it: duplicate `data.yaml` as `data_human.yaml` with just the person
class, train two smaller models, and run two `inference.py` processes (one per zone type)
pointed at the same or different cameras.

## Edge optimization
Once training is validated, export for faster on-device inference:
```bash
yolo export model=runs/detect/train/weights/best.pt format=onnx
# or, on a Jetson: format=engine for TensorRT
```
