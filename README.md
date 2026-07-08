# GrowEasy CRM Lead Importer

An intelligent, AI-powered CSV importer built to standardize arbitrary CRM lead spreadsheets into GrowEasy's unified schema using Google Gemini.

## Overview
- **Problem Statement:** Standardizing lead sheets exported from various marketing channels (Facebook Ads, Google Ads, raw Excel sheets, Real Estate CRMs) into a single, unified CRM database. 
- **Why this is hard:** It is not about simply parsing CSV files; it is about semantic field mapping. Raw columns have dynamic, messy, or ambiguous headers (e.g., "Full Name", "Lead Name", "first_name", "phone", "contact_no") and unstructured values that require context-aware mapping rather than basic string-matching algorithms.

## Live Demo
- **Hosted URL:** https://gro-weasy.vercel.app/
- **GitHub Repo:** `https://github.com/LEVELING2108/GROWeasy.git`
- **Hosted Backend URL:** `https://groweasy-backend-a7il.onrender.com`

## Features
- **Drag & drop CSV upload:** Plus standard file picker supporting up to 5MB files.
- **No-AI preview step:** Local parsing via PapaParse displays a preview table instantly to keep UI responsive and save API costs.
- **Confirm-to-import flow:** Let users inspect data column headers before calling the backend.
- **AI-powered field mapping (batched):** Uses `gemini-2.0-flash` with JSON schema enforcement, batching records in groups of 10 to speed up execution.
- **Results view:** Shows total imported vs skipped lead counts, success records table, and skipped lead cards detailing reasons (e.g., missing contact details).
- **Simulation Fallback Mode:** Operates out-of-the-box using deterministic matching if no Gemini API key is configured.
- **Dark Mode Support:** Clean, modern, responsive glassmorphic dashboard theme with system preferences local storage sync.

## Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Vanilla CSS, Lucide Icons, PapaParse.
- **Backend:** Node.js, Express, Multer, `@google/genai` (Official Google Gemini SDK).
- **AI:** Google Gemini (`gemini-2.0-flash`) in strict JSON schema mode.
- **Database:** Local JSON database file (`backend/leads_db.json`) equipped with robust read/write queueing and lead deduplication rules.

## Architecture
### High-level Flow
```text
Upload CSV (Drag/Picker) ➔ Parse locally (PapaParse) ➔ Preview Table ➔ Confirm Upload ➔ Send to Express Backend ➔ Batch records (10 per batch) ➔ AI mapping (Gemini SDK) ➔ Post-process validation ➔ Deduplicate & Save (leads_db.json) ➔ Return JSON ➔ Display Results
```

### Folder Structure
```text
GROWeasy/
├── backend/                   # Node.js Express backend
│   ├── .env.example
│   ├── leads_db.json          # Local persistence database
│   ├── package.json
│   ├── server.js              # Express app, Gemini configuration, API routing
│   └── server.test.js         # Backend unit tests
├── frontend/                  # Next.js App Router frontend
│   ├── public/
│   ├── src/
│   │   └── app/
│   │       ├── globals.css    # Premium style system & animations
│   │       ├── layout.tsx
│   │       └── page.tsx       # Main page layout & modal upload flows
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml         # Container build configurations
├── render.yaml                # One-click Render Blueprint setup
├── package.json
└── README.md
```

## CRM Schema
The following 15 target fields are extracted and verified:

| Field | Description | Rules / Verification |
| :--- | :--- | :--- |
| `created_at` | Lead creation date | ISO Date string parseable by `new Date()` |
| `name` | Lead full name | Raw name fields |
| `email` | Primary email address | Standard format (extras saved to `crm_note`) |
| `country_code` | Phone country code | Extracted country code (e.g. `+91`) |
| `mobile_without_country_code` | Mobile number | Clean mobile number without country code |
| `company` | Company name | Mapped from raw organization tags |
| `city` | City | Extracted location components |
| `state` | State | Extracted location components |
| `country` | Country | Extracted location components |
| `lead_owner` | Assigned owner email | Assigned owner tag |
| `crm_status` | Lead standing | Restricted to allowed statuses list |
| `crm_note` | Remarks & Consolidated extras | Append secondary phones, secondary emails, and raw comments |
| `data_source` | Campaign channel source | Restricted to allowed source tags |
| `possession_time` | Possession time | Property possession time details |
| `description` | Extra lead description | General description details |

### Allowed `crm_status` values:
- `GOOD_LEAD_FOLLOW_UP`
- `DID_NOT_CONNECT`
- `BAD_LEAD`
- `SALE_DONE`

### Allowed `data_source` values:
- `leads_on_demand`
- `meridian_tower`
- `eden_park`
- `varah_swamy`
- `sarjapur_plots`

---

## AI Mapping Rules Implemented
- **Multiple emails/phones:** The first email/phone encountered is placed in the primary fields. Any additional email addresses or mobile numbers found are consolidated inside the `crm_note` attribute (e.g., `"Alt Mobile: 9876543210"`).
- **Date validation:** AI parses dynamic date layouts into standard ISO format. On validation, the backend tests date parsing with `new Date(created_at)`. If it fails, it falls back to the current timestamp.
- **Newline escaping:** Output strings are checked. Multi-line remarks or notes (e.g., inside `crm_note` or `description`) are escaped with `\n` to prevent breaking CSV rows during export.
- **Skip logic:** Any raw record that contains **neither** an email **nor** a mobile number is automatically skipped.

---

## Setup Instructions

### 1. Local Setup
```bash
# Clone the repository
git clone https://github.com/LEVELING2108/GROWeasy.git
cd GROWeasy

# Install dependencies in root, frontend, and backend folders
npm run install:all

# Create local environment config
cp backend/.env.example backend/.env

# Start development servers
npm run dev
```

### 2. Required Environment Variables
Configure the following inside `backend/.env`:
* `PORT` (Default: `5000`)
* `GEMINI_API_KEY` (Your Google Gemini API Key)

### 3. How to get a Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click **Create API Key**.
3. Copy the key and paste it into `backend/.env`.

---

## Deployment

### 1. Backend (Render)
* We have configured a `render.yaml` file at the root.
* Log in to **Render**, select **Blueprints**, and connect your GitHub repository.
* Set the environment variables:
  * `GEMINI_API_KEY`: Your Gemini API Key.
  * `FRONTEND_URL`: Your Vercel frontend URL (e.g. `https://your-app.vercel.app`).
* Click **Apply** to deploy the service.

### 2. Frontend (Vercel)
* Log in to **Vercel**, select **Add New Project**, and import your repository.
* Set **Root Directory** to `frontend`.
* Add the following environment variable:
  * `NEXT_PUBLIC_API_URL`: Set this to your Render backend URL (e.g., `https://groweasy-backend-a7il.onrender.com`).
* Click **Deploy**.
* *Ensure you update `FRONTEND_URL` on Render with your final Vercel App URL to satisfy the backend CORS policy.*

---

## Testing
- **Sample CSVs:** A sample CSV template and mock leads are provided in the [samples/](file:///C:/Users/suman/WebstormProjects/GROWeasy/samples) directory.
- **How to test:** 
  1. Open the importer modal, upload any file from the `samples/` directory, and inspect the preview.
  2. Confirm the import to run AI mapping.
  3. Verify statuses and columns mapping against the dashboard.
- **Edge cases handled:** 
  * Completely empty or malformed files (rejected with warning).
  * Missing email and mobile (skipped with record explanation).
  * Duplicate leads (deduplicated based on name/email/phone match).

---

## Known Limitations / Future Improvements
* **Large File Optimization:** Implement a virtualized list (like `react-window`) to handle preview tables exceeding 10,000 rows without lagging.
* **Database Integration:** Replace the local JSON database file (`leads_db.json`) with an enterprise cloud database (e.g., PostgreSQL or MongoDB) for persistent cloud deployments.
* **Incremental Batching Streams:** Utilize server-sent events (SSE) to stream parsed results back to the frontend row-by-row instead of waiting for the full batch array call to complete.

---

## Submission
- **Position Applied For:** Software Developer Intern
