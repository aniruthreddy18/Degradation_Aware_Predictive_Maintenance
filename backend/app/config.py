"""Central configuration. Everything deployment-specific comes from environment variables."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("PM_DATA_DIR", ROOT / "data"))
ARTIFACT_DIR = Path(os.getenv("PM_ARTIFACT_DIR", ROOT / "artifacts"))

# --- Problem definition (matches the project presentation) -----------------
RUL_CAP = 125          # piecewise-linear RUL target cap (slide 5)
WINDOW = 30            # sliding-window length in cycles
HEALTHY_ABOVE = 80     # RUL > 80  -> Healthy (slide 14)
CRITICAL_AT_MOST = 30  # RUL <= 30 -> Critical

COLUMNS = ["unit", "cycle", "op1", "op2", "op3"] + [f"s{i}" for i in range(1, 22)]
ALL_SENSORS = [f"s{i}" for i in range(1, 22)]
# 7 sensors are constant / near-constant in FD001 and carry no degradation signal.
DROPPED_SENSORS = ["s1", "s5", "s6", "s10", "s16", "s18", "s19"]
SENSORS = [s for s in ALL_SENSORS if s not in DROPPED_SENSORS]  # 14 informative sensors

SENSOR_INFO = {
    "s1": ("T2", "Fan inlet temperature", "°R"),
    "s2": ("T24", "LPC outlet temperature", "°R"),
    "s3": ("T30", "HPC outlet temperature", "°R"),
    "s4": ("T50", "LPT outlet temperature", "°R"),
    "s5": ("P2", "Fan inlet pressure", "psia"),
    "s6": ("P15", "Bypass-duct pressure", "psia"),
    "s7": ("P30", "HPC outlet pressure", "psia"),
    "s8": ("Nf", "Physical fan speed", "rpm"),
    "s9": ("Nc", "Physical core speed", "rpm"),
    "s10": ("epr", "Engine pressure ratio", "—"),
    "s11": ("Ps30", "HPC static pressure", "psia"),
    "s12": ("phi", "Fuel flow / Ps30 ratio", "pps/psi"),
    "s13": ("NRf", "Corrected fan speed", "rpm"),
    "s14": ("NRc", "Corrected core speed", "rpm"),
    "s15": ("BPR", "Bypass ratio", "—"),
    "s16": ("farB", "Burner fuel-air ratio", "—"),
    "s17": ("htBleed", "Bleed enthalpy", "—"),
    "s18": ("Nf_dmd", "Demanded fan speed", "rpm"),
    "s19": ("PCNfR_dmd", "Demanded corrected fan speed", "rpm"),
    "s20": ("W31", "HPT coolant bleed", "lbm/s"),
    "s21": ("W32", "LPT coolant bleed", "lbm/s"),
}

# --- Serving ---------------------------------------------------------------
MC_PASSES = int(os.getenv("PM_MC_PASSES", "50"))      # MC-dropout passes (slide: 50)
CORS_ORIGINS = [o.strip() for o in os.getenv("PM_CORS_ORIGINS", "*").split(",") if o.strip()]
API_KEY = os.getenv("PM_API_KEY", "")                 # if set, POST /api/predict requires X-API-Key
MAX_PREDICT_ROWS = int(os.getenv("PM_MAX_PREDICT_ROWS", "1000"))


def risk_of(rul: float) -> str:
    if rul > HEALTHY_ABOVE:
        return "Healthy"
    if rul > CRITICAL_AT_MOST:
        return "Warning"
    return "Critical"


def action_for(risk: str) -> str:
    return {
        "Critical": "Ground & inspect immediately",
        "Warning": "Schedule maintenance window",
        "Healthy": "Continue normal operation",
    }[risk]
