# GrowEasy AI-Powered CSV CRM Importer

This repository contains the submission for the **GrowEasy Software Developer Assignment**. It features an intelligent CSV CRM importer built to extract, map, and standardize lead details from any arbitrary CSV structure using Google Gemini AI, featuring a Next.js App Router frontend and a Node.js Express backend.

---

## 🚀 Submission Information

* **Position Applied For:** [Software Developer Intern / Software Developer (Full-Time)] *(Please update before submitting)*
* **Hosted Frontend URL (Vercel):** `https://[YOUR_VERCEL_APP_URL].vercel.app` *(Please update with your Vercel URL)*
* **Hosted Backend URL (Render):** `https://groweasy-backend-a7il.onrender.com`
* **GitHub Repository URL:** `https://github.com/LEVELING2108/GROWeasy.git`
* **Submission Email:** `varun@groweasy.ai`
* **Submission Deadline:** 12 July 2026

---

## 🌟 Assignment Functional Requirements

The application fully implements all steps specified in the assignment guidelines:

### 1. Frontend Requirements (Next.js)
* **Step 1 — Upload CSV:** Supports both modern **Drag & Drop** and a standard **File Picker** to upload any raw CSV file (up to 5MB).
* **Step 2 — Preview:** Instantly parses CSV files locally using PapaParse without calling the AI. Previews raw headers and records inside a responsive, glassmorphic table with:
  * Horizontal and vertical scrolling.
  * Sticky headers.
  * Pagination limit (15-row lazy rendering) to handle larger CSVs.
* **Step 3 — Confirm Import:** An explicit "Upload File" button initiates the AI mapping request on the backend only after the user confirms.
* **Step 4 — Display Parsed Result:** Displays the AI-mapped leads in a secondary CRM table, displaying:
  * Successfully imported count.
  * Skipped leads count.
  * Skipped records panel detailing the specific reason (e.g. invalid date, duplicate lead, missing contact details).

### 2. Backend Requirements (Express & Node.js)
* **Accept & Parse CSV:** Multer receives the uploaded file in memory. PapaParse parses records into JSON formats irrespective of dynamic or messy column names.
* **AI Extraction Batching:** Splits parsed records into small batches (10 records each) to stay within LLM token limits and speed up calls.
* **Google Gemini AI SDK:** Uses official `@google/genai` (calling `gemini-2.0-flash`) in strict JSON schema mode to extract and format data.
* **Structured JSON Return:** Returns standardized CRM records mapped to the target schema.

### 3. AI Instructions & CRM Schema Rules
* **Standardized Statuses:** Maps messy raw statuses to: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, or `SALE_DONE`.
* **Standardized Data Sources:** Maps raw campaign names strictly to: `leads_on_demand`, `meridian_tower`, `eden_park`, `varah_swamy`, `sarjapur_plots` (or empty if unconfident).
* **Date Conversion:** Formats `created_at` values to dates convertible using JS `new Date(created_at)`.
* **Email & Phone Consolidation:** Extracted from raw lists. The primary email and primary mobile go into their respective columns, while additional emails, secondary phones, and general comments are appended neatly to `crm_note`.
* **Skip Invalid Records:** Skips records containing neither an email nor a phone number.
* **Database Deduplication:** Enforces database deduplication on write (persisted in `leads_db.json`):
  * Same email is a duplicate.
  * Same phone, different name is NOT a duplicate (shared company line).
  * Same phone, same name is a duplicate.
  * Same phone, both lack email is a duplicate.

---

## 🏆 Bonus Points Implemented

* [x] **Drag & Drop Upload Zone:** Interactive states, file type warnings, and drag overlays.
* [x] **Progress Indicators & Logs:** Interactive scanner animations (sonar pulses + grid scan) and console logs showing step-by-step progress during AI parsing.
* [x] **AI Retry Mechanism:** Built-in exponential backoff retry mechanism (`callGeminiWithRetry`) for connection/rate limits.
* [x] **Simulation Fallback Mode:** Seamlessly falls back to a deterministic, rule-based matching algorithm if the Gemini API key is missing or rate-limited.
* [x] **Dark Mode support:** Features a fully polished dark-mode dashboard (saved in local storage).
* [x] **Unit Tests:** Backend unit testing suite verifying deduplication rules and match criteria.
* [x] **Docker Setup:** Production multi-container configurations (`docker-compose.yml` and `Dockerfile` files).
* [x] **Production Deployment:** Live production deployment on Vercel (Frontend) and Render (Backend).

---

## 🛠️ Tech Stack

* **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Vanilla CSS, Lucide Icons, PapaParse.
* **Backend:** Node.js, Express, Multer, `@google/genai` (official SDK), PapaParse, Dotenv.
* **Testing:** Node.js built-in test runner (`node --test`).
* **Deployment:** Vercel (Frontend), Render (Backend).

---

## ⚙️ Local Setup Instructions

### 1. Install Dependencies
From the root workspace folder, install package dependencies for both workspaces:
```bash
npm run install:all
```

### 2. Configure Environment variables
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
GEMINI_API_KEY=your_gemini_api_key_here
```
*(If left empty/default, the application runs in Simulation Mode).*

### 3. Launch Development Servers
Concurrently run both backend (`http://localhost:5000`) and frontend (`http://localhost:3000`) development servers:
```bash
npm run dev
```

### 4. Run Unit Tests
Validate code behavior and deduplication tests:
```bash
cd backend
npm test
```

### 5. Running with Docker (Alternative)
Boot both backend and frontend concurrently in local containers:
```bash
docker-compose up --build
```
The frontend will be exposed at `http://localhost:3000` and the backend at `http://localhost:5000`.
