import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from streamlit.testing.v1 import AppTest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
sys.path.insert(0, str(PROJECT_ROOT))

app = AppTest.from_file(str(PROJECT_ROOT / "streamlit_app.py"))
app.session_state["user"] = {
    "username": os.environ.get("QAQC_BOOTSTRAP_ADMIN_EMAIL", "admin"),
    "email": os.environ.get("QAQC_BOOTSTRAP_ADMIN_EMAIL", "admin@example.invalid"),
    "name": "System Administrator",
    "role": "admin",
    "status": "approved",
}
app.run(timeout=30)

print({
    "exceptions": len(app.exception),
    "metrics": len(app.metric),
    "selectboxes": len(app.selectbox),
    "navigation": len(app.radio),
})

if app.exception:
    raise RuntimeError(app.exception[0].value)
