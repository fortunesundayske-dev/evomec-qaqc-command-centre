from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from urllib import request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from dotenv import load_dotenv
import pandas as pd
import streamlit as st
from pymongo import MongoClient


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WORKBOOK = BASE_DIR / "data" / "QAQC_Master.xlsx"
DEFAULT_STANDARDS = BASE_DIR / "data" / "dep_standards_index.csv"
load_dotenv(BASE_DIR / ".env")

st.set_page_config(page_title="Evomec QA/QC Command Centre", page_icon="✅", layout="wide")


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


@st.cache_data(show_spinner=False)
def workbook_data():
    workbook_path = Path(setting("QAQC_EXCEL_PATH", str(DEFAULT_WORKBOOK)))
    if not workbook_path.exists():
        return {}
    excel = pd.ExcelFile(workbook_path)
    return {sheet: pd.read_excel(excel, sheet) for sheet in excel.sheet_names}


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


def authenticate(email: str, password: str):
    document = database().users.find_one({"email": email.strip().lower()})
    if not document or document.get("status") != "approved":
        return None
    candidate = hash_password(password, str(document.get("salt", "")))
    stored = str(document.get("password", ""))
    return document if hmac.compare_digest(candidate, stored) else None


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
    return user_collection().find_one({"username": user.get("username")}) or user


def configure_cloudinary():
    cloudinary_url = setting("CLOUDINARY_URL")
    if not cloudinary_url:
        raise RuntimeError("CLOUDINARY_URL is not configured.")
    parsed = urlparse(cloudinary_url)
    if parsed.scheme != "cloudinary" or not parsed.hostname or not parsed.username or not parsed.password:
        raise RuntimeError("CLOUDINARY_URL is invalid.")
    cloudinary.config(
        cloud_name=parsed.hostname,
        api_key=unquote(parsed.username),
        api_secret=unquote(parsed.password),
        secure=True,
    )


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
    user_collection().update_one({"username": user.get("username")}, {"$set": {"profile_photo_asset": asset}})
    return asset


def render_profile(user):
    record = current_user_record(user)
    st.title("User Profile")
    st.caption("Review your account information and update your display details.")
    asset = record.get("profile_photo_asset")
    try:
        photo_url = profile_photo_url(asset)
    except Exception:
        photo_url = ""
    if photo_url:
        st.image(photo_url, width=120)
    uploaded_photo = st.file_uploader("Profile photo", type=["jpg", "jpeg", "png", "webp"], help="Maximum 5 MB. Stored in Cloudinary.")
    if st.button("Upload profile photo", disabled=uploaded_photo is None, type="secondary"):
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
            {"username": record.get("username")},
            {"$set": {"name": name.strip(), "discipline": discipline.strip()}},
        )
        st.session_state.user.update({"name": name.strip(), "discipline": discipline.strip()})
        log_activity(record, "update_profile", "account")
        st.success("Profile updated.")

    st.subheader("Account status")
    st.write({"Username": record.get("username"), "Email": email, "Role": record.get("role"), "Status": record.get("status")})


def render_activity_log(user):
    st.title("Activity Log")
    st.caption("Traceable account and Command Centre activity.")
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
    st.markdown("# Evomec QA/QC Command Centre")
    st.caption("Secure project quality, inspection, and compliance control")
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
    st.title("QA/QC Command Centre")
    st.caption(f"Executive quality snapshot for {project.lower()}.")
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
    st.divider()
    st.subheader("Available operational datasets")
    st.dataframe(pd.DataFrame({"Dataset": list(data), "Records": [len(frame) for frame in data.values()]}), hide_index=True, width="stretch")


def render_records(data: dict[str, pd.DataFrame], module: str, project: str):
    st.title(module)
    frame = data.get(module, pd.DataFrame())
    if frame.empty:
        st.info("No data available for this module.")
        return
    st.dataframe(filtered_frame(frame, project), hide_index=True, width="stretch", height=560)


def render_calibration(data: dict[str, pd.DataFrame], project: str):
    st.title("Calibration Log")
    frame = filtered_frame(data.get("Calibration Log", pd.DataFrame()), project)
    due = calibration_records({"Calibration Log": frame})
    st.caption("Equipment due within 21 days or already overdue.")
    if st.button("Send Teams calibration alerts", type="primary"):
        sent, message = send_calibration_teams_alerts(due)
        (st.success if sent else st.warning)(message)
    if frame.empty:
        st.info("No calibration data available.")
    else:
        st.dataframe(frame, hide_index=True, width="stretch", height=560)


def render_admin(user):
    if user.get("role") not in {"admin", "super_admin"}:
        st.error("Administrator access required.")
        return
    st.title("Access / Administration")
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
                            database_instance.users.update_one({"username": username}, {"$set": {"role": role, "status": status}})
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
    if "user" not in st.session_state:
        render_login()
        return
    user = st.session_state.user
    data = workbook_data()
    projects = {str(value) for frame in data.values() if "Project" in frame.columns for value in frame["Project"].dropna()}
    with st.sidebar:
        st.markdown("## EVOMEC")
        st.caption("QA/QC COMMAND CENTRE")
        st.write(f"**{user.get('name') or user.get('email')}**")
        st.caption(str(user.get("role", "user")).upper())
        project = st.selectbox("Current project", ["All Projects"] + sorted(projects))
        modules = ["Overview"] + list(data.keys()) + ["User Profile", "Activity Log"]
        if user.get("role") in {"admin", "super_admin"}:
            modules.append("Access / Administration")
        module = st.radio("Navigation", modules)
        if st.button("Sign out", width="stretch"):
            log_activity(user, "sign_out", "authentication")
            del st.session_state.user
            st.rerun()
    if module == "Overview":
        render_overview(data, project)
    elif module == "User Profile":
        render_profile(user)
    elif module == "Activity Log":
        render_activity_log(user)
    elif module == "Calibration Log":
        render_calibration(data, project)
    elif module == "Access / Administration":
        render_admin(user)
    else:
        render_records(data, module, project)


if __name__ == "__main__":
    main()
