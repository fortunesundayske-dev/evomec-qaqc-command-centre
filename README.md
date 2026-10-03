# Evomec QA/QC Command Centre

The Command Centre has two connected front ends over the same QA/QC workbook and MongoDB account store:

- React web dashboard: `http://localhost:5173`
- Streamlit operations dashboard: `http://localhost:8501`
- Node API: `http://localhost:8000`

## First-time setup

1. Copy `.env.example` to `.env` if it is not already present.
2. Set `MONGODB_URI`, `MONGODB_DATABASE`, `QAQC_BOOTSTRAP_ADMIN_EMAIL`, and `QAQC_BOOTSTRAP_ADMIN_PASSWORD`.
3. Keep `QAQC_EXCEL_PATH=data/QAQC_Master.xlsx` unless the workbook is stored elsewhere. Relative paths are resolved from this project directory.
4. Set `VITE_QAQC_API_URL=http://localhost:8000` for a separately hosted API, or leave it blank to use the Vite `/api` proxy during local development.

The configured bootstrap administrator is created/approved automatically by both the API and Streamlit app. Profile photos are optional; to enable them, set `CLOUDINARY_URL` to `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.

## Run locally on Windows

Open three PowerShell windows in this directory:

```powershell
npm.cmd run api:dev
```

```powershell
npm.cmd run dev
```

```powershell
npm.cmd run streamlit
```

PowerShell installations that block `npm.ps1` should use `npm.cmd`, as shown. The Streamlit script uses the installed Python 3 launcher (`py -3`) rather than the Microsoft Store `python` alias.

## Verify

```powershell
Invoke-RestMethod http://localhost:8000/health
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vite.cmd build
py -3 -m streamlit run app.py --server.headless true
```

The React dashboard is backed by `data/QAQC_Master.xlsx`; it no longer displays hard-coded QA/QC demo records. Streamlit uses the same workbook path and MongoDB users, activity log, profile images, and administrator permissions. In React, administrators can add and update complete records in Daily Reports, KPI/KRA, CTQ, and other workbook modules. Forms are generated from the selected sheet's existing headers, and writes are restricted to mapped sheets and validated fields. Every workbook change records its module, row, and changed field names in the activity log without copying record contents. Non-admin users remain read-only. Streamlit retains its existing permitted date-field editing.

Workbook write regression tests run with `npm test`. The API limits JSON request bodies, sends security headers, restricts browser origins to `APP_ORIGIN`, and throttles failed sign-in attempts by client IP and email. Keep production secrets in deployment environment variables; `.env` files are ignored by Git.
