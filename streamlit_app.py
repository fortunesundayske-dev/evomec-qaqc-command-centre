from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import streamlit as st
from pymongo import MongoClient


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WORKBOOK = BASE_DIR.parent / "QAQC_Dashboard" / "data" / "QAQC_Master.xlsx"

st.set_page_config(page_title="Evomec QA/QC Command Centre", page_icon="✅", layout="wide")


def setting(name: str, default: str = "") -> str:
    try:
        return str(st.secrets.get(name, default) or default).strip()
    except Exception:
        return default


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


def render_admin(user):
    if user.get("role") not in {"admin", "super_admin"}:
        st.error("Administrator access required.")
        return
    st.title("Access / Administration")
    database_instance = database()
    tabs = st.tabs(["Users", "Activity Log", "Support Tickets"])
    with tabs[0]:
        users = list(database_instance.users.find({}, {"_id": 0, "password": 0, "salt": 0}))
        st.dataframe(pd.DataFrame(users), hide_index=True, width="stretch")
    with tabs[1]:
        activity = list(database_instance.activity_log.find({}, {"_id": 0}).sort("occurred_at", -1).limit(500))
        st.dataframe(pd.DataFrame(activity), hide_index=True, width="stretch")
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
        module = st.radio("Navigation", ["Overview"] + list(data.keys()) + (["Access / Administration"] if user.get("role") in {"admin", "super_admin"} else []))
        if st.button("Sign out", width="stretch"):
            log_activity(user, "sign_out", "authentication")
            del st.session_state.user
            st.rerun()
    if module == "Overview":
        render_overview(data, project)
    elif module == "Access / Administration":
        render_admin(user)
    else:
        render_records(data, module, project)


if __name__ == "__main__":
    main()
