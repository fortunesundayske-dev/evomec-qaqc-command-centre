from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import secrets
from urllib import request
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from dotenv import load_dotenv
import pandas as pd
import streamlit as st
from openpyxl import load_workbook
from pymongo import MongoClient


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WORKBOOK = BASE_DIR / "data" / "QAQC_Master.xlsx"
DEFAULT_STANDARDS = BASE_DIR / "data" / "dep_standards_index.csv"
DATE_COLUMNS = {
    "date", "date raised", "due_date", "due date", "date_raised", "planned_date", "actual_date",
    "calibration_date", "next_due_date", "reminder_date", "issue_date", "start_date", "end_date",
    "target_date", "date_logged", "date identified", "date closed", "response date", "report_date",
    "acknowledged_on", "snoozed_until", "last_notified_on",
}
load_dotenv(BASE_DIR / ".env")

st.set_page_config(page_title="Evomec QA/QC Command Centre", page_icon="✅", layout="wide")


def apply_command_centre_theme():
    """Keep the Streamlit surface aligned with the React Command Centre tokens."""
    st.markdown(
        """
        <style>
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');

          :root {
            --ev-bg: oklch(0.13 0.025 250);
            --ev-surface: oklch(0.18 0.03 250);
                        --ev-surface-raised: oklch(0.22 0.04 250);
            --ev-sidebar: oklch(0.105 0.028 250);
                        --ev-text: oklch(0.93 0.015 220);
                        --ev-muted: oklch(0.62 0.035 225);
            --ev-primary: oklch(0.76 0.15 195);
            --ev-primary-ink: oklch(0.12 0.03 250);
                        --ev-accent: oklch(0.72 0.13 75);
                        --ev-danger: oklch(0.62 0.18 28);
                        --ev-border: oklch(0.29 0.045 250);
                        --ev-input: oklch(0.25 0.04 250);
            --ev-radius: 0.7rem;
            --ev-shadow: 0 14px 35px oklch(0.04 0.02 250 / 0.32);
          }

          html, body, .stApp, [data-testid="stAppViewContainer"] {
            background: var(--ev-bg) !important;
            color: var(--ev-text) !important;
            font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif !important;
          }
          [data-testid="stHeader"] { background: color-mix(in oklch, var(--ev-bg) 95%, transparent) !important; border-bottom: 1px solid var(--ev-border); }
          [data-testid="stToolbar"] { color: var(--ev-muted); }
          [data-testid="stAppViewContainer"] > .main { background: transparent !important; }
          .main .block-container { max-width: 1700px !important; padding: 1.75rem 1.75rem 3rem !important; }

          [data-testid="stSidebar"] { background: var(--ev-sidebar) !important; border-right: 1px solid var(--ev-border); }
          [data-testid="stSidebar"] > div:first-child { background: var(--ev-sidebar) !important; }
          [data-testid="stSidebar"] .block-container { padding: 1rem .75rem 2rem !important; }
          [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p { color: var(--ev-text); }

          .evomec-brand { display: flex; align-items: center; gap: .75rem; margin: .15rem .25rem 1.65rem; }
          .evomec-mark { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: .75rem; background: var(--ev-primary); color: var(--ev-primary-ink); font: 700 1.1rem "IBM Plex Mono", monospace; }
          .evomec-wordmark { margin: 0; color: var(--ev-text); font: 700 .95rem "IBM Plex Mono", monospace; letter-spacing: .18em; }
          .evomec-submark, .evomec-nav-label, .cc-eyebrow, .cc-status { margin: 0; color: var(--ev-primary); font: 600 .62rem "IBM Plex Mono", monospace; letter-spacing: .16em; text-transform: uppercase; }
          .evomec-nav-label { color: var(--ev-muted); margin: 1.25rem .55rem .35rem; }
          .evomec-user { margin: 0 .25rem 1rem; padding: .85rem; border: 1px solid var(--ev-border); border-radius: var(--ev-radius); background: color-mix(in oklch, var(--ev-surface) 78%, transparent); }
          .evomec-user strong { display: block; color: var(--ev-text); font-size: .82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .evomec-user span { color: var(--ev-muted); font: 600 .61rem "IBM Plex Mono", monospace; letter-spacing: .09em; text-transform: uppercase; }

          .cc-topbar { display: flex; align-items: end; justify-content: space-between; gap: 1rem; min-height: 3.8rem; margin: -.25rem 0 1.45rem; padding: .35rem 0 1rem; border-bottom: 1px solid var(--ev-border); }
          .cc-topbar h1, .cc-hero h1, .cc-page-heading h1 { margin: .28rem 0 0; color: var(--ev-text); font-size: clamp(1.2rem, 2vw, 1.9rem); font-weight: 650; letter-spacing: -.025em; line-height: 1.15; }
          .cc-user-meta { color: var(--ev-muted); font: 500 .7rem "IBM Plex Mono", monospace; text-align: right; text-transform: uppercase; letter-spacing: .08em; }
          .cc-hero { position: relative; overflow: hidden; margin: 0 0 1.5rem; padding: clamp(1.5rem, 3vw, 2.25rem); border: 1px solid color-mix(in oklch, var(--ev-primary) 28%, var(--ev-border)); border-radius: 1rem; background: radial-gradient(circle at 90% 0%, color-mix(in oklch, var(--ev-primary) 18%, transparent), transparent 33rem), var(--ev-surface); box-shadow: var(--ev-shadow); }
          .cc-hero h1 { max-width: 46rem; margin-top: .65rem; font-size: clamp(1.75rem, 3vw, 2.55rem); }
          .cc-hero p:not(.cc-eyebrow) { max-width: 50rem; margin: .85rem 0 0; color: var(--ev-muted); font-size: .9rem; line-height: 1.65; }
          .cc-page-heading { margin: 0 0 1.25rem; }
          .cc-page-heading p:not(.cc-eyebrow) { margin: .45rem 0 0; color: var(--ev-muted); font-size: .9rem; }
          .cc-section-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; margin: 1.65rem 0 .75rem; }
          .cc-section-heading h2 { margin: .25rem 0 0; color: var(--ev-text); font-size: 1.16rem; letter-spacing: -.015em; }

          h1, h2, h3, p, label, span, div { font-family: inherit; }
          [data-testid="stMetric"] { min-height: 8.7rem; padding: 1.2rem !important; border: 1px solid var(--ev-border); border-radius: var(--ev-radius); background: color-mix(in oklch, var(--ev-surface) 92%, transparent); box-shadow: 0 4px 14px oklch(0.05 0.02 250 / .22); }
          [data-testid="stMetricLabel"] { color: var(--ev-muted) !important; font-size: .75rem; }
          [data-testid="stMetricValue"] { color: var(--ev-text) !important; font: 650 1.8rem "IBM Plex Mono", monospace; letter-spacing: -.05em; }
          [data-testid="stMetricDelta"] { color: var(--ev-primary) !important; }
          [data-testid="stVerticalBlockBorderWrapper"], [data-testid="stForm"] { border: 1px solid var(--ev-border) !important; border-radius: var(--ev-radius) !important; background: var(--ev-surface) !important; box-shadow: var(--ev-shadow); }

          .stButton > button, [data-testid="stFormSubmitButton"] > button, [data-testid="stDownloadButton"] > button {
            min-height: 2.35rem; border: 1px solid transparent !important; border-radius: .55rem !important; background: var(--ev-primary) !important; color: var(--ev-primary-ink) !important; font: 650 .78rem "DM Sans", sans-serif !important; box-shadow: 0 4px 14px oklch(0.05 0.02 250 / .22); transition: transform .15s ease, filter .15s ease;
          }
          .stButton > button:hover, [data-testid="stFormSubmitButton"] > button:hover, [data-testid="stDownloadButton"] > button:hover { filter: brightness(1.06); transform: translateY(-1px); }
          .stButton > button[kind="secondary"] { border-color: var(--ev-border) !important; background: var(--ev-surface) !important; color: var(--ev-text) !important; }

          [data-testid="stTextInput"] input, [data-testid="stTextArea"] textarea, [data-baseweb="select"] > div, [data-testid="stDateInput"] input, [data-testid="stNumberInput"] input {
            border-color: var(--ev-border) !important; border-radius: .55rem !important; background: var(--ev-input) !important; color: var(--ev-text) !important; box-shadow: none !important;
          }
          [data-testid="stTextInput"] input:focus, [data-testid="stTextArea"] textarea:focus, [data-baseweb="select"] > div:focus-within { border-color: var(--ev-primary) !important; box-shadow: 0 0 0 2px color-mix(in oklch, var(--ev-primary) 24%, transparent) !important; }
          [data-testid="stTextInput"] label, [data-testid="stTextArea"] label, [data-testid="stSelectbox"] label, [data-testid="stDateInput"] label, [data-testid="stRadio"] label { color: var(--ev-text) !important; font-size: .78rem !important; }
          [data-baseweb="select"] * { color: var(--ev-text) !important; }
          [data-baseweb="popover"], [role="listbox"] { background: var(--ev-surface-raised) !important; color: var(--ev-text) !important; }

          [data-testid="stDataFrame"] { overflow: hidden; border: 1px solid var(--ev-border) !important; border-radius: var(--ev-radius) !important; background: var(--ev-surface) !important; box-shadow: var(--ev-shadow); }
          [data-testid="stDataFrame"] iframe { border-radius: inherit; }
          [data-testid="stTabs"] [role="tablist"] { gap: .35rem; border-bottom: 1px solid var(--ev-border); }
          [data-testid="stTabs"] [role="tab"] { border-radius: .5rem .5rem 0 0; color: var(--ev-muted); font-size: .78rem; }
          [data-testid="stTabs"] [aria-selected="true"] { color: var(--ev-primary) !important; border-bottom-color: var(--ev-primary) !important; }
          [data-testid="stAlert"] { border: 1px solid var(--ev-border); border-radius: var(--ev-radius); background: var(--ev-surface); color: var(--ev-text); }
          hr { border-color: var(--ev-border) !important; }
          [data-testid="stCaptionContainer"], .stCaption { color: var(--ev-muted) !important; }
          [data-testid="stRadio"] [role="radiogroup"] { gap: .18rem; }
          [data-testid="stRadio"] label { width: 100%; min-height: 2.35rem; padding: .48rem .6rem; border-radius: .55rem; color: var(--ev-muted) !important; transition: background .15s ease, color .15s ease; }
          [data-testid="stRadio"] label:has(input:checked) { background: var(--ev-primary); color: var(--ev-primary-ink) !important; font-weight: 650; }
          [data-testid="stRadio"] label:has(input:checked) * { color: var(--ev-primary-ink) !important; }
          [data-testid="stRadio"] input { accent-color: var(--ev-primary); }

          @media (max-width: 700px) {
            .main .block-container { padding: 1rem 1rem 2.5rem !important; }
            .cc-topbar { margin-top: 0; }
            .cc-user-meta { display: none; }
          }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_page_heading(eyebrow: str, title: str, description: str = ""):
    description_html = f"<p>{html.escape(description)}</p>" if description else ""
    st.markdown(
        f'<section class="cc-page-heading"><p class="cc-eyebrow">{html.escape(eyebrow)}</p><h1>{html.escape(title)}</h1>{description_html}</section>',
        unsafe_allow_html=True,
    )


def setting(name: str, default: str = "") -> str:
    try:
        secret_value = st.secrets.get(name, None)
        return str(secret_value if secret_value not in (None, "") else os.getenv(name, default)).strip()
    except Exception:
        return str(os.getenv(name, default) or default).strip()


@st.cache_resource(show_spinner=False)
def database():
    uri = setting("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not configured in Streamlit secrets.")
    client = MongoClient(uri, appname="evomec-qaqc-command-centre", serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    return client[setting("MONGODB_DATABASE", "qaqc_dashboard")]


def configured_path(name: str, default: Path) -> Path:
    configured = Path(setting(name, str(default)))
    return configured if configured.is_absolute() else BASE_DIR / configured


@st.cache_data(show_spinner=False)
def workbook_data(workbook_path: str, modified_at: float):
    del modified_at  # Include the timestamp in the cache key so workbook edits refresh the dashboard.
    workbook_path = Path(workbook_path)
    if not workbook_path.exists():
        return {}
    excel = pd.ExcelFile(workbook_path)
    data = {}
    for sheet in excel.sheet_names:
        frame = pd.read_excel(excel, sheet)
        # All controlled workbooks use a header in Excel row 1. Keep the source row
        # internally so an administrator edit can target the exact cell safely.
        frame.insert(0, "__Excel_Row", range(2, len(frame) + 2))
        data[sheet] = frame
    return data


def is_date_column(column: object) -> bool:
    normalized = str(column).strip().lower()
    return normalized in DATE_COLUMNS or normalized.endswith("_date") or normalized.endswith(" date")


def display_frame(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.drop(columns=["__Excel_Row"], errors="ignore")


def record_label(row: pd.Series) -> str:
    for column in ("ITR_No", "NCR_No", "OBS_No", "Audit_ID", "Calibration_ID", "Document_No", "Equipment_ID", "Project"):
        value = row.get(column)
        if pd.notna(value) and str(value).strip():
            return str(value).strip()
    return "Selected record"


def save_workbook_date(workbook_path: Path, sheet_name: str, row_number: int, field: str, value: date) -> None:
    if not is_date_column(field):
        raise ValueError("Only date fields can be updated from the Command Centre.")
    workbook = load_workbook(workbook_path)
    if sheet_name not in workbook.sheetnames:
        raise ValueError(f"Workbook sheet '{sheet_name}' was not found.")
    sheet = workbook[sheet_name]
    headers = {str(cell.value).strip(): cell.column for cell in sheet[1] if cell.value is not None}
    if field not in headers:
        raise ValueError(f"Date field '{field}' was not found in {sheet_name}.")
    if row_number < 2 or row_number > sheet.max_row:
        raise ValueError("The workbook row no longer exists. Refresh the records and try again.")
    cell = sheet.cell(row=row_number, column=headers[field])
    cell.value = value
    if not cell.number_format or cell.number_format == "General":
        cell.number_format = "yyyy-mm-dd"
    workbook.save(workbook_path)


def render_record_date_editor(frame: pd.DataFrame, sheet_name: str, user: dict, workbook_path: Path):
    if user.get("role") not in {"admin", "super_admin"}:
        return
    date_columns = [str(column) for column in frame.columns if is_date_column(column)]
    if frame.empty or not date_columns or "__Excel_Row" not in frame.columns:
        return
    st.divider()
    st.subheader("Administrator date update")
    st.caption("Changes are written directly to the controlled Excel workbook and are recorded in the activity log.")
    rows = frame["__Excel_Row"].astype(int).tolist()
    selected_row = st.selectbox(
        "Record",
        rows,
        format_func=lambda row_number: f"Excel row {row_number} — {record_label(frame.loc[frame['__Excel_Row'] == row_number].iloc[0])}",
        key=f"date_row_{sheet_name}",
    )
    record = frame.loc[frame["__Excel_Row"] == selected_row].iloc[0]
    field = st.selectbox("Date field", date_columns, key=f"date_field_{sheet_name}")
    current_value = pd.to_datetime(record.get(field), errors="coerce")
    chosen_date = st.date_input("New date", value=current_value.date() if pd.notna(current_value) else date.today(), key=f"date_value_{sheet_name}")
    if st.button("Save date to workbook", type="primary", key=f"save_date_{sheet_name}"):
        try:
            save_workbook_date(workbook_path, sheet_name, int(selected_row), field, chosen_date)
            log_activity(user, "update_workbook_date", "workbook", {"sheet": sheet_name, "row": int(selected_row), "field": field, "value": chosen_date.isoformat()})
            st.cache_data.clear()
            st.success(f"{field} was saved to {sheet_name}, Excel row {selected_row}.")
            st.rerun()
        except Exception as error:
            st.error(f"Unable to save the date: {error}")


def calibration_records(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    frame = data.get("Calibration Log", pd.DataFrame()).copy()
    if frame.empty:
        return frame
    if "Next_Due_Date" not in frame.columns:
        return pd.DataFrame()
    frame["Next_Due_Date"] = pd.to_datetime(frame["Next_Due_Date"], errors="coerce")
    frame = frame.dropna(subset=["Next_Due_Date"])
    frame["Days_Until_Due"] = (frame["Next_Due_Date"].dt.normalize() - pd.Timestamp.now().normalize()).dt.days
    return frame[frame["Days_Until_Due"] <= 21].copy()


def send_calibration_teams_alerts(records: pd.DataFrame) -> tuple[bool, str]:
    webhook = setting("TEAMS_WEBHOOK_URL")
    if not webhook:
        return False, "TEAMS_WEBHOOK_URL is not configured in Streamlit secrets."
    if records.empty:
        return False, "No overdue or due-soon calibration records found."
    lines = ["QA/QC Calibration Notification", f"Equipment requiring attention: {len(records)}", ""]
    for _, row in records.iterrows():
        equipment = row.get("Equipment_Type") or row.get("Instrument_Name") or "Equipment"
        identifier = row.get("Calibration_ID") or row.get("Equipment_ID") or "N/A"
        days = int(row.get("Days_Until_Due", 0))
        timing = f"{abs(days)} day(s) overdue" if days < 0 else f"{days} day(s) remaining"
        lines.extend([f"- {equipment} ({identifier})", f"  Due: {row['Next_Due_Date']:%Y-%m-%d} | {timing}"])
    payload = json.dumps({"text": "\n".join(lines)}).encode("utf-8")
    try:
        req = request.Request(webhook, data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with request.urlopen(req, timeout=30) as response:
            return True, f"Teams accepted the calibration alert ({response.status})."
    except Exception as error:
        return False, f"Teams delivery failed: {error}"


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha512", password.encode(), salt.encode(), 310_000, 32).hex()


def account_query(user: dict) -> dict:
    values = [str(user.get(key, "")).strip() for key in ("username", "email", "id")]
    values = [value for value in values if value]
    return {"$or": [{"username": value} for value in values] + [{"email": value} for value in values]}


def ensure_bootstrap_admin():
    email = setting("QAQC_BOOTSTRAP_ADMIN_EMAIL").lower()
    password = setting("QAQC_BOOTSTRAP_ADMIN_PASSWORD")
    if not email or len(password) < 8:
        return
    users = database().users
    existing = users.find_one({"email": email})
    if existing:
        users.update_one({"_id": existing["_id"]}, {"$set": {"username": existing.get("username") or email, "name": existing.get("name") or existing.get("displayName") or "System Administrator", "role": "admin", "status": "approved"}})
        return
    salt = secrets.token_hex(16)
    password_hash = hash_password(password, salt)
    users.insert_one({
        "username": email,
        "email": email,
        "name": "System Administrator",
        "displayName": "System Administrator",
        "role": "admin",
        "status": "approved",
        "discipline": "Quality Management",
        "salt": salt,
        "password": password_hash,
        "passwordHash": password_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "failed_attempts": 0,
        "locked_until": None,
        "password_iterations": 310_000,
    })


def authenticate(email: str, password: str):
    document = database().users.find_one({"email": email.strip().lower()})
    if not document or document.get("status") != "approved":
        return None
    candidate = hash_password(password, str(document.get("salt", "")))
    stored = str(document.get("passwordHash") or document.get("password") or "")
    return document if stored and hmac.compare_digest(candidate, stored) else None


def log_activity(user, action: str, category: str, details: dict | None = None):
    try:
        database().activity_log.insert_one({
            "event_id": secrets.token_hex(16),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "username": user.get("username", ""),
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
            "action": action,
            "category": category,
            "page": "Streamlit QA/QC Command Centre",
            "status": "success",
            "details": details or {},
        })
    except Exception:
        pass


def user_collection():
    return database().users


def current_user_record(user):
    return user_collection().find_one(account_query(user)) or user


def cloudinary_config_values():
    cloud_name = setting("CLOUDINARY_CLOUD_NAME")
    api_key = setting("CLOUDINARY_API_KEY")
    api_secret = setting("CLOUDINARY_API_SECRET")
    if cloud_name and api_key and api_secret:
        return {"cloud_name": cloud_name, "api_key": api_key, "api_secret": api_secret, "secure": True}

    cloudinary_url = setting("CLOUDINARY_URL")
    if not cloudinary_url:
        return None
    parsed = urlparse(cloudinary_url)
    if parsed.scheme != "cloudinary" or not parsed.hostname or not parsed.username or not parsed.password:
        return None
    return {"cloud_name": parsed.hostname, "api_key": unquote(parsed.username), "api_secret": unquote(parsed.password), "secure": True}


def configure_cloudinary():
    config = cloudinary_config_values()
    if not config:
        raise RuntimeError("Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET, or provide a complete CLOUDINARY_URL.")
    cloudinary.config(**config)


def profile_photo_url(asset: dict | None) -> str:
    if not isinstance(asset, dict) or not asset.get("public_id"):
        return ""
    configure_cloudinary()
    url, _ = cloudinary.utils.cloudinary_url(
        asset["public_id"],
        secure=True,
        type="authenticated",
        sign_url=True,
        resource_type="image",
    )
    return url


def upload_profile_photo(user: dict, uploaded_file) -> dict:
    if uploaded_file is None:
        raise ValueError("Choose an image before uploading.")
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if uploaded_file.type not in allowed_types:
        raise ValueError("Use a JPG, PNG, or WebP image.")
    if uploaded_file.size > 5 * 1024 * 1024:
        raise ValueError("Profile photos must be 5 MB or smaller.")
    configure_cloudinary()
    username = str(user.get("username") or user.get("email") or "user").replace("@", "-")
    folder = setting("CLOUDINARY_FOLDER", "qaqc-command-centre")
    result = cloudinary.uploader.upload(
        uploaded_file,
        folder=f"{folder}/profile-photos",
        public_id=f"{username}-{secrets.token_hex(6)}",
        resource_type="image",
        type="authenticated",
        overwrite=False,
    )
    asset = {
        "public_id": result["public_id"],
        "resource_type": result.get("resource_type", "image"),
        "format": result.get("format", ""),
        "bytes": int(result.get("bytes") or 0),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    user_collection().update_one(account_query(user), {"$set": {"profile_photo_asset": asset}})
    return asset


def render_profile(user):
    record = current_user_record(user)
    render_page_heading("SYSTEM / USER PROFILE", "User profile", "Review your account information and update your display details.")
    asset = record.get("profile_photo_asset")
    try:
        photo_url = profile_photo_url(asset)
    except Exception:
        photo_url = ""
    if photo_url:
        st.image(photo_url, width=120)
    if cloudinary_config_values():
        st.caption("Profile photo storage is connected to Cloudinary.")
    else:
        st.warning("Profile photo storage is not configured. Set the Cloudinary credentials in Streamlit secrets or the server environment.")
    uploaded_photo = st.file_uploader("Profile photo", type=["jpg", "jpeg", "png", "webp"], help="Maximum 5 MB. Stored in Cloudinary.")
    if st.button("Upload profile photo", disabled=uploaded_photo is None or not cloudinary_config_values(), type="secondary"):
        try:
            saved_asset = upload_profile_photo(record, uploaded_photo)
            log_activity(record, "upload_profile_photo", "account", {"public_id": saved_asset["public_id"]})
            st.success("Profile photo saved to Cloudinary.")
            st.rerun()
        except Exception as error:
            st.error(f"Profile photo upload failed: {error}")
    with st.form("profile_form"):
        name = st.text_input("Name", value=str(record.get("name") or record.get("displayName") or ""))
        discipline = st.text_input("Discipline", value=str(record.get("discipline") or ""))
        email = st.text_input("Email", value=str(record.get("email") or ""), disabled=True)
        submitted = st.form_submit_button("Save profile", type="primary")
    if submitted:
        user_collection().update_one(
            account_query(record),
            {"$set": {"name": name.strip(), "discipline": discipline.strip()}},
        )
        st.session_state.user.update({"name": name.strip(), "discipline": discipline.strip()})
        log_activity(record, "update_profile", "account")
        st.success("Profile updated.")

    st.subheader("Account status")
    st.write({"Username": record.get("username"), "Email": email, "Role": record.get("role"), "Status": record.get("status")})


def render_activity_log(user):
    render_page_heading("SYSTEM / ACTIVITY", "Activity log", "Traceable account and Command Centre activity.")
    if user.get("role") not in {"admin", "super_admin"}:
        st.info("Activity log access is restricted to administrators.")
        return
    records = list(database().activity_log.find({}, {"_id": 0}).sort("occurred_at", -1).limit(1000))
    frame = pd.DataFrame(records)
    if frame.empty:
        st.info("No activity has been recorded yet.")
        return
    filter_col, action_col, status_col = st.columns(3)
    with filter_col:
        usernames = ["All users"] + sorted(frame.get("username", pd.Series(dtype=str)).dropna().astype(str).unique().tolist())
        selected_user = st.selectbox("User", usernames)
    with action_col:
        actions = ["All actions"] + sorted(frame.get("action", pd.Series(dtype=str)).dropna().astype(str).unique().tolist())
        selected_action = st.selectbox("Action", actions)
    with status_col:
        statuses = ["All results"] + sorted(frame.get("status", pd.Series(dtype=str)).dropna().astype(str).unique().tolist())
        selected_status = st.selectbox("Result", statuses)
    if selected_user != "All users":
        frame = frame[frame["username"].astype(str) == selected_user]
    if selected_action != "All actions":
        frame = frame[frame["action"].astype(str) == selected_action]
    if selected_status != "All results":
        frame = frame[frame["status"].astype(str) == selected_status]
    st.dataframe(frame, hide_index=True, width="stretch", height=560)
    st.download_button("Download activity CSV", frame.to_csv(index=False).encode("utf-8"), "qaqc_activity_log.csv", "text/csv")


def render_login():
    st.markdown(
        """
        <section class="cc-hero">
          <p class="cc-eyebrow">EVOMEC / QUALITY SYSTEM</p>
          <h1>Quality performance under control.</h1>
          <p>Secure project quality, inspection, compliance, and controlled workbook records from one Command Centre.</p>
        </section>
        """,
        unsafe_allow_html=True,
    )
    with st.form("command_centre_login"):
        email = st.text_input("Administrator or work email", placeholder="name@company.com")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Sign in", type="primary", width="stretch")
    if submitted:
        try:
            user = authenticate(email, password)
            if not user:
                st.error("Invalid credentials or account not approved.")
            else:
                st.session_state.user = user
                log_activity(user, "sign_in", "authentication")
                st.rerun()
        except Exception as error:
            st.error(f"Authentication service unavailable: {error}")
    st.info("Password reset and access approval are managed by the administrator workflow.")


def filtered_frame(frame: pd.DataFrame, project: str) -> pd.DataFrame:
    if project == "All Projects" or "Project" not in frame.columns:
        return frame.copy()
    return frame[frame["Project"].astype(str) == project].copy()


def render_overview(data: dict[str, pd.DataFrame], project: str):
    st.markdown(
        f"""
        <section class="cc-hero">
          <p class="cc-eyebrow">LIVE QUALITY INTELLIGENCE</p>
          <h1>Quality performance under control.</h1>
          <p>Current workbook data across inspections, non-conformances, audits, calibration, and controlled records for {html.escape(project.lower())}.</p>
        </section>
        """,
        unsafe_allow_html=True,
    )
    st.markdown('<div class="cc-section-heading"><div><p class="cc-eyebrow">EXECUTIVE SIGNALS</p><h2>Quality pulse</h2></div><span class="cc-status">WORKBOOK CONNECTED</span></div>', unsafe_allow_html=True)
    metrics = []
    for label, keys in {
        "ITRs": ["ITR Log", "ITR Tracker"],
        "NCRs": ["NCR Log", "NCR Tracker"],
        "Observations": ["OBS Log", "OBS Tracker"],
        "Audits": ["Audit Register", "Audit Log"],
        "Concrete pours": ["Concrete Tracker"],
        "Calibration records": ["Calibration Log"],
    }.items():
        frame = next((filtered_frame(data[key], project) for key in keys if key in data), pd.DataFrame())
        metrics.append((label, len(frame)))
    columns = st.columns(len(metrics))
    for column, (label, value) in zip(columns, metrics):
        column.metric(label, f"{value:,}")
    st.markdown('<div class="cc-section-heading"><div><p class="cc-eyebrow">WORKBOOK DATASETS</p><h2>Available operational datasets</h2></div></div>', unsafe_allow_html=True)
    st.dataframe(pd.DataFrame({"Dataset": list(data), "Records": [len(frame) for frame in data.values()]}), hide_index=True, width="stretch")


def render_records(data: dict[str, pd.DataFrame], module: str, project: str, user: dict, workbook_path: Path):
    render_page_heading("QUALITY OPERATIONS", module, f"Live records from the controlled QA/QC workbook for {project.lower()}.")
    frame = data.get(module, pd.DataFrame())
    if frame.empty:
        st.info("No data available for this module.")
        return
    records = filtered_frame(frame, project)
    search = st.text_input("Search current records", placeholder="Search the current records", key=f"search_{module}")
    if search.strip():
        matches = records.astype(str).apply(lambda column: column.str.contains(search.strip(), case=False, na=False))
        records = records[matches.any(axis=1)]
    st.dataframe(display_frame(records), hide_index=True, width="stretch", height=560)
    render_record_date_editor(records, module, user, workbook_path)


def render_calibration(data: dict[str, pd.DataFrame], project: str, user: dict, workbook_path: Path):
    render_page_heading("QUALITY OPERATIONS", "Calibration log", f"Controlled calibration records for {project.lower()}.")
    frame = filtered_frame(data.get("Calibration Log", pd.DataFrame()), project)
    due = calibration_records({"Calibration Log": frame})
    st.caption("Equipment due within 21 days or already overdue.")
    if st.button("Send Teams calibration alerts", type="primary"):
        sent, message = send_calibration_teams_alerts(due)
        (st.success if sent else st.warning)(message)
    if frame.empty:
        st.info("No calibration data available.")
    else:
        st.dataframe(display_frame(frame), hide_index=True, width="stretch", height=560)
        render_record_date_editor(frame, "Calibration Log", user, workbook_path)


def render_admin(user):
    if user.get("role") not in {"admin", "super_admin"}:
        st.error("Administrator access required.")
        return
    render_page_heading("SYSTEM / ACCESS ADMIN", "Access administration", "Administrators only")
    database_instance = database()
    tabs = st.tabs(["Users", "Activity Log", "Support Tickets"])
    with tabs[0]:
        users = list(database_instance.users.find({}, {"_id": 0, "password": 0, "salt": 0}))
        if users:
            for account in users:
                username = account.get("username", account.get("email", ""))
                with st.container(border=True):
                    st.write(f"**{account.get('name') or username}** · {account.get('email', '')}")
                    st.caption(f"Role: {account.get('role', 'user')} · Status: {account.get('status', 'pending')} · Discipline: {account.get('discipline', '')}")
                    role_col, status_col, action_col = st.columns([1, 1, 1])
                    with role_col:
                        role = st.selectbox("Role", ["admin", "user", "viewer"], index=["admin", "user", "viewer"].index(account.get("role", "user")) if account.get("role", "user") in {"admin", "user", "viewer"} else 1, key=f"role_{username}")
                    with status_col:
                        status = st.selectbox("Status", ["pending", "approved", "restricted", "rejected"], index=["pending", "approved", "restricted", "rejected"].index(account.get("status", "pending")) if account.get("status", "pending") in {"pending", "approved", "restricted", "rejected"} else 0, key=f"status_{username}")
                    with action_col:
                        if st.button("Save access", key=f"save_access_{username}", width="stretch"):
                            database_instance.users.update_one(account_query(account), {"$set": {"role": role, "status": status}})
                            log_activity(user, "update_user_access", "administration", {"target": username, "role": role, "status": status})
                            st.success("Access updated.")
        else:
            st.info("No user accounts found.")
    with tabs[1]:
        render_activity_log(user)
    with tabs[2]:
        tickets = list(database_instance.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).limit(500))
        st.dataframe(pd.DataFrame(tickets), hide_index=True, width="stretch")


def main():
    apply_command_centre_theme()
    try:
        ensure_bootstrap_admin()
    except Exception as error:
        st.error(f"Database connection unavailable: {error}")
        st.info("Set MONGODB_URI and MONGODB_DATABASE in .env or Streamlit secrets, then restart the app.")
        return
    if "user" not in st.session_state:
        render_login()
        return
    user = st.session_state.user
    workbook_path = configured_path("QAQC_EXCEL_PATH", DEFAULT_WORKBOOK)
    if not workbook_path.exists():
        st.error(f"QA/QC workbook was not found: {workbook_path}")
        return
    data = workbook_data(str(workbook_path), workbook_path.stat().st_mtime)
    projects = {str(value) for frame in data.values() if "Project" in frame.columns for value in frame["Project"].dropna()}
    with st.sidebar:
        st.markdown(
            """
            <div class="evomec-brand">
              <div class="evomec-mark">E</div>
              <div><p class="evomec-wordmark">EVOMEC</p><p class="evomec-submark">QA/QC Command Centre</p></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div class="evomec-user"><strong>{html.escape(str(user.get("name") or user.get("email") or "User"))}</strong><span>{html.escape(str(user.get("role", "user")))}</span></div>',
            unsafe_allow_html=True,
        )
        st.markdown('<p class="evomec-nav-label">Command Centre</p>', unsafe_allow_html=True)
        modules = ["Overview"] + list(data.keys()) + ["User Profile", "Activity Log"]
        if user.get("role") in {"admin", "super_admin"}:
            modules.append("Access / Administration")
        module = st.radio("Navigation", modules, label_visibility="collapsed")
        st.markdown('<p class="evomec-nav-label">Session</p>', unsafe_allow_html=True)
        if st.button("Sign out", width="stretch"):
            log_activity(user, "sign_out", "authentication")
            del st.session_state.user
            st.rerun()

    heading_column, project_column = st.columns([4, 1.25], vertical_alignment="bottom")
    with heading_column:
        title = "QA/QC Command Centre" if module == "Overview" else module
        st.markdown(
            f'<section class="cc-topbar"><div><p class="cc-eyebrow">EVOMEC / QUALITY SYSTEM</p><h1>{html.escape(title)}</h1></div><span class="cc-user-meta">{html.escape(str(user.get("role", "user")))}</span></section>',
            unsafe_allow_html=True,
        )
    with project_column:
        project = st.selectbox("Current project", ["All Projects"] + sorted(projects), label_visibility="collapsed")
    if module == "Overview":
        render_overview(data, project)
    elif module == "User Profile":
        render_profile(user)
    elif module == "Activity Log":
        render_activity_log(user)
    elif module == "Calibration Log":
        render_calibration(data, project, user, workbook_path)
    elif module == "Access / Administration":
        render_admin(user)
    else:
        render_records(data, module, project, user, workbook_path)


if __name__ == "__main__":
    main()
