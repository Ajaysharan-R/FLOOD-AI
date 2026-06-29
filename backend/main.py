from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict
import requests   # 🔹 ADDITION (Flood API)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =================================================
# NEW AGENT — FLOOD DATA AGENT (OPEN-METEO)
# =================================================
def fetch_flood_index(lat: float, lon: float) -> Optional[float]:
    """
    Fetches river discharge data from Open-Meteo Flood API
    and converts it into a normalized flood index (0–1).

    Returns:
        float  -> flood index if data exists
        None   -> if API fails or no data
    """
    try:
        url = (
            "https://flood-api.open-meteo.com/v1/flood"
            f"?latitude={lat}&longitude={lon}&daily=river_discharge"
        )

        response = requests.get(url, timeout=5)
        if response.status_code != 200:
            return None

        data = response.json()
        discharge_list = data.get("daily", {}).get("river_discharge", [])

        if not discharge_list:
            return None

        # Use maximum discharge as worst-case flood signal
        discharge = max(discharge_list)

        # Normalize discharge (documented reference)
        DISCHARGE_REFERENCE = 500.0  # m³/s (regional reference)
        flood_index = min(discharge / DISCHARGE_REFERENCE, 1.0)

        return flood_index

    except Exception:
        return None


# =================================================
# EXISTING FEATURE — FLOOD PREDICTION (AUGMENTED)
# =================================================
@app.get("/predict")
def predict_flood(
    rainfall: float,            # mm/hour
    slope: float,               # unitless (rise/run)
    lat: Optional[float] = None,  # 🔹 ADDITION (optional)
    lon: Optional[float] = None,  # 🔹 ADDITION (optional)
    drainage_context: Optional[Dict] = None
):
    """
    Flood prediction using normalized, dimensionless indices.
    Augmented with Open-Meteo Flood API (optional).
    """

    # -------------------------
    # 1. REFERENCE VALUES
    # -------------------------
    R_MAX = 100.0     # max expected rainfall (mm/hr)
    S_MIN = 0.02      # minimum slope
    D_MAX = 50.0      # max possible flood depth (cm)

    slope = max(slope, S_MIN)

    # -------------------------
    # 2. NORMALIZED INDICES
    # -------------------------
    rain_index = rainfall / R_MAX
    slope_index = (1 / slope) / (1 / S_MIN)

    # -------------------------
    # 3. FLOOD API SIGNAL (NEW)
    # -------------------------
    flood_api_index = None
    if lat is not None and lon is not None:
        flood_api_index = fetch_flood_index(lat, lon)

    # -------------------------
    # 4. FLOOD RISK INDEX (AUGMENTED)
    # -------------------------
    if flood_api_index is not None:
        flood_risk_index = (
            0.6 * flood_api_index +
            0.25 * rain_index +
            0.15 * slope_index
        )
    else:
        # Fallback to original logic
        flood_risk_index = rain_index + slope_index

    flood_risk_index = min(max(flood_risk_index, 0), 1.5)

    # -------------------------
    # 5. FLOOD DEPTH (cm)
    # -------------------------
    flood_depth = flood_risk_index * D_MAX

    # -------------------------
    # 6. DRAINAGE TIME (hrs)
    # -------------------------
    drainage_time = flood_depth / 7

    # -------------------------
    # 7. GIS-AWARE EXPLANATION
    # -------------------------
    drainage_note = "normal surface drainage conditions"

    if drainage_context:
        notes = []

        if drainage_context.get("drainCount", 0) < 3:
            notes.append("sparse surface drains")

        if drainage_context.get("nearCanal"):
            notes.append("canal proximity")

        if drainage_context.get("canalCrossings", 0) > 0:
            notes.append("canal crossings")

        if notes:
            drainage_note = ", ".join(notes)

    # -------------------------
    # 8. RESPONSE
    # -------------------------
    return {
        "flood_depth_cm": round(flood_depth, 2),
        "drainage_time_hr": round(drainage_time, 2),
        "flood_risk_index": round(flood_risk_index, 3),
        "drainage_note": drainage_note
    }


# =================================================
# FEATURE 2 — VEHICLE-FIRST ROUTE SELECTION (UNCHANGED)
# =================================================

VEHICLE_LIMITS = {
    "bike": {
        "max_flood_depth": 10,
        "max_traffic": "moderate"
    },
    "auto": {
        "max_flood_depth": 15,
        "max_traffic": "moderate"
    },
    "car": {
        "max_flood_depth": 25,
        "max_traffic": "heavy"
    },
    "bus": {
        "max_flood_depth": 40,
        "max_traffic": "heavy"
    }
}

TRAFFIC_ORDER = {
    "free": 1,
    "moderate": 2,
    "heavy": 3
}


@app.post("/vehicle/filter-routes")
def filter_routes_by_vehicle(payload: dict):
    """
    Filters routes based on vehicle feasibility.
    Vehicle decision happens BEFORE route comparison.
    """

    vehicle = payload.get("vehicle")
    routes = payload.get("routes", [])

    if vehicle not in VEHICLE_LIMITS:
        return {
            "valid_routes": [],
            "rejected_routes": routes
        }

    limits = VEHICLE_LIMITS[vehicle]

    valid_routes = []
    rejected_routes = []

    for route in routes:
        flood_depth = route.get("flood_depth", 0)
        traffic_level = route.get("traffic", "free")

        if flood_depth > limits["max_flood_depth"]:
            route["reason"] = "Flood depth exceeds vehicle tolerance"
            rejected_routes.append(route)
            continue

        if TRAFFIC_ORDER.get(traffic_level, 1) > TRAFFIC_ORDER[limits["max_traffic"]]:
            route["reason"] = "Traffic congestion too high for vehicle"
            rejected_routes.append(route)
            continue

        valid_routes.append(route)

    return {
        "valid_routes": valid_routes,
        "rejected_routes": rejected_routes
    }
