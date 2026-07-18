const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Papa = require('papaparse');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Basic origin restriction for security (CORS)
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());

// Set up Multer for file upload (memory storage)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const sqlite3 = require('sqlite3').verbose();
const sqliteDbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'leads.db');
const db = new sqlite3.Database(sqliteDbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT,
    name TEXT,
    email TEXT,
    country_code TEXT,
    mobile_without_country_code TEXT,
    company TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    lead_owner TEXT,
    crm_status TEXT,
    crm_note TEXT,
    data_source TEXT,
    possession_time TEXT,
    description TEXT
  )`);

  const legacyDbPath = path.join(__dirname, 'leads_db.json');
  if (fs.existsSync(legacyDbPath)) {
    try {
      const data = fs.readFileSync(legacyDbPath, 'utf8');
      const leads = JSON.parse(data);
      if (Array.isArray(leads) && leads.length > 0) {
        db.get("SELECT COUNT(*) as count FROM leads", (err, row) => {
          if (!err && row.count === 0) {
            console.log("Migrating legacy leads_db.json to SQLite database...");
            const stmt = db.prepare(`INSERT INTO leads (
              created_at, name, email, country_code, mobile_without_country_code,
              company, city, state, country, lead_owner, crm_status, crm_note,
              data_source, possession_time, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            const allowedStatuses = ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"];

            leads.forEach(l => {
              let status = l.crm_status || 'GOOD_LEAD_FOLLOW_UP';
              if (!allowedStatuses.includes(status)) {
                const checkString = ((l.crm_status || '') + ' ' + (l.crm_note || '')).trim().toLowerCase();
                if (checkString.includes('busy') || checkString.includes('no answer') || checkString.includes('not connect') || checkString.includes('dialed') || checkString.includes('dial') || checkString.includes('unreachable')) {
                  status = 'DID_NOT_CONNECT';
                } else if (checkString.includes('not interested') || checkString.includes('bad') || checkString.includes('wrong') || checkString.includes('junk') || checkString.includes('spam') || checkString.includes('trash') || checkString.includes('invalid')) {
                  status = 'BAD_LEAD';
                } else if (checkString.includes('close') || checkString.includes('sold') || checkString.includes('won') || checkString.includes('done') || checkString.includes('convert') || checkString.includes('sale') || checkString.includes('complete')) {
                  status = 'SALE_DONE';
                }
              }

              stmt.run(
                l.created_at || new Date().toISOString(),
                l.name || '',
                l.email || '',
                l.country_code || '',
                l.mobile_without_country_code || '',
                l.company || '',
                l.city || '',
                l.state || '',
                l.country || '',
                l.lead_owner || '',
                status,
                l.crm_note || '',
                l.data_source || '',
                l.possession_time || '',
                l.description || ''
              );
            });
            stmt.finalize();
            console.log(`Migrated ${leads.length} records successfully.`);
          }
        });
      }
    } catch (err) {
      console.error("Failed to migrate legacy leads:", err);
    }
  }
});

function loadLeadsFromDatabase() {
  return new Promise((resolve) => {
    db.all("SELECT * FROM leads ORDER BY id DESC", (err, rows) => {
      if (err) {
        console.error("Failed to load leads:", err);
        resolve([]);
      } else {
        resolve(rows || []);
      }
    });
  });
}

function getLeadsCount() {
  return new Promise((resolve) => {
    db.get("SELECT COUNT(*) as count FROM leads", (err, row) => {
      if (err) {
        console.error("Failed to count leads:", err);
        resolve(0);
      } else {
        resolve(row ? row.count : 0);
      }
    });
  });
}

function insertLeads(newLeads) {
  return new Promise((resolve, reject) => {
    if (newLeads.length === 0) return resolve();
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      const stmt = db.prepare(`INSERT INTO leads (
        created_at, name, email, country_code, mobile_without_country_code,
        company, city, state, country, lead_owner, crm_status, crm_note,
        data_source, possession_time, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      newLeads.forEach(l => {
        stmt.run(
          l.created_at,
          l.name,
          l.email,
          l.country_code,
          l.mobile_without_country_code,
          l.company,
          l.city,
          l.state,
          l.country,
          l.lead_owner,
          l.crm_status,
          l.crm_note,
          l.data_source,
          l.possession_time,
          l.description
        );
      });
      stmt.finalize();
      db.run("COMMIT", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function updateLeadStatus(email, mobile, crm_status) {
  return new Promise((resolve, reject) => {
    const valEmail = (email || '').trim().toLowerCase();
    const valMobile = (mobile || '').trim();
    let sql = "";
    let params = [crm_status];
    if (valEmail && valMobile) {
      sql = "UPDATE leads SET crm_status = ? WHERE LOWER(email) = ? AND mobile_without_country_code = ?";
      params.push(valEmail, valMobile);
    } else if (valEmail) {
      sql = "UPDATE leads SET crm_status = ? WHERE LOWER(email) = ?";
      params.push(valEmail);
    } else if (valMobile) {
      sql = "UPDATE leads SET crm_status = ? WHERE mobile_without_country_code = ?";
      params.push(valMobile);
    } else {
      return reject(new Error("No identifier provided"));
    }
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function updateLeadNote(email, mobile, crm_note) {
  return new Promise((resolve, reject) => {
    const valEmail = (email || '').trim().toLowerCase();
    const valMobile = (mobile || '').trim();
    let sql = "";
    let params = [crm_note];
    if (valEmail && valMobile) {
      sql = "UPDATE leads SET crm_note = ? WHERE LOWER(email) = ? AND mobile_without_country_code = ?";
      params.push(valEmail, valMobile);
    } else if (valEmail) {
      sql = "UPDATE leads SET crm_note = ? WHERE LOWER(email) = ?";
      params.push(valEmail);
    } else if (valMobile) {
      sql = "UPDATE leads SET crm_note = ? WHERE mobile_without_country_code = ?";
      params.push(valMobile);
    } else {
      return reject(new Error("No identifier provided"));
    }
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function deleteLead(email, mobile) {
  return new Promise((resolve, reject) => {
    const valEmail = (email || '').trim().toLowerCase();
    const valMobile = (mobile || '').trim();
    let sql = "";
    let params = [];
    if (valEmail && valMobile) {
      sql = "DELETE FROM leads WHERE LOWER(email) = ? AND mobile_without_country_code = ?";
      params.push(valEmail, valMobile);
    } else if (valEmail) {
      sql = "DELETE FROM leads WHERE LOWER(email) = ?";
      params.push(valEmail);
    } else if (valMobile) {
      sql = "DELETE FROM leads WHERE mobile_without_country_code = ?";
      params.push(valMobile);
    } else {
      return reject(new Error("No identifier provided"));
    }
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

// Strict identifier matching helper to prevent matching empty fields
function isLeadMatch(lead, email, mobile) {
  const hasEmail = typeof email === 'string' && email.trim() !== '';
  const hasMobile = typeof mobile === 'string' && mobile.trim() !== '';
  
  if (!hasEmail && !hasMobile) {
    return false;
  }
  
  const emailMatch = hasEmail && lead.email && 
                     email.trim().toLowerCase() === lead.email.trim().toLowerCase();
  const mobileMatch = hasMobile && lead.mobile_without_country_code && 
                      mobile.trim() === lead.mobile_without_country_code.trim();
  
  if (hasEmail && hasMobile) {
    return emailMatch && mobileMatch;
  }
  return hasEmail ? emailMatch : mobileMatch;
}

function checkIsDuplicate(newLead, existingLeads) {
  return existingLeads.some(existing => {
    const emailMatch = newLead.email && existing.email && 
                       newLead.email.trim().toLowerCase() === existing.email.trim().toLowerCase();
    const phoneMatch = newLead.mobile_without_country_code && existing.mobile_without_country_code && 
                       newLead.mobile_without_country_code.trim() === existing.mobile_without_country_code.trim();
    
    if (emailMatch) return true;
    
    if (phoneMatch) {
      const nameMatch = newLead.name && existing.name &&
                        newLead.name.trim().toLowerCase() === existing.name.trim().toLowerCase();
      return nameMatch || (!newLead.email && !existing.email);
    }
    
    return false;
  });
}

// Initialize Gemini API client
let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined in environment variables. Backend will run in simulation mode.");
}

// System instructions for the model
const SYSTEM_INSTRUCTION = `
You are an expert CRM data extraction assistant for GrowEasy.
Your task is to analyze a batch of raw records from a parsed CSV and map their columns into the GrowEasy CRM schema.

Standard CRM Schema:
- created_at: Lead creation date (format: YYYY-MM-DD HH:mm:ss, or an ISO string parseable by JS 'new Date()').
- name: Full name of the lead.
- email: Primary email address.
- country_code: Country code (e.g. +91, +1, etc. - extract from phone field if present).
- mobile_without_country_code: Mobile number without country code.
- company: Company name.
- city: City.
- state: State.
- country: Country.
- lead_owner: Email or name of lead owner.
- crm_status: Must be exactly one of: "GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE". If unknown, use "GOOD_LEAD_FOLLOW_UP".
- crm_note: Capture follow-up notes, additional comments, and CRITICAL: append any extra phone numbers or extra emails here.
- data_source: Must be exactly one of: "leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots", or empty string if none matches confidently.
- possession_time: Possession time of properties if available.
- description: General description.

Mapping rules:
1. crm_status:
   - "GOOD_LEAD_FOLLOW_UP": interested, follow up, contacted, warm, callback.
   - "DID_NOT_CONNECT": busy, no answer, disconnected, switched off.
   - "BAD_LEAD": not interested, wrong number, junk, spam.
   - "SALE_DONE": deal closed, converted, sold, won.
2. Multiple Emails/Phones:
   - Put first email in 'email' and first mobile in 'mobile_without_country_code'.
   - Add any additional emails/mobiles to 'crm_note' with labels (e.g. "Alt Mobile: 9876543210").
3. Skip criteria:
   - If a record has NEITHER an email nor any phone number, skip it by setting name: null and email: null, and the backend will filter it out. Or omit it from the returned array.
4. Output format: You must return a JSON array containing exactly the mapped records.
`;

// Helper to batch array elements
const batchArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const callGeminiWithRetry = async (prompt, systemInstruction) => {
  const retries = 2;
  let delayMs = 1000;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        }
      });
    } catch (err) {
      if (attempt > retries) {
        throw err;
      }
      console.warn(`Gemini API Call Attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
};

// Route to handle CSV upload and parsing (AI processing)
// NOTE: Add authentication middleware here before deploying to production.
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvDataString = req.file.buffer.toString('utf-8');
    
    // Parse CSV using PapaParse
    const parsed = Papa.parse(csvDataString, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return res.status(400).json({ error: 'Failed to parse CSV file', details: parsed.errors });
    }

    const rawRecords = parsed.data;

    // Parse column mappings from the request body if present
    let mappings = null;
    if (req.body.mappings) {
      try {
        mappings = typeof req.body.mappings === 'string' ? JSON.parse(req.body.mappings) : req.body.mappings;
      } catch (err) {
        console.error('Failed to parse column mappings:', err);
      }
    }

    // Filter out records that are completely empty
    const validRawRecords = rawRecords.filter(row => {
      // Must have some data
      return Object.values(row).some(val => val && val.trim() !== '');
    });

    if (validRawRecords.length === 0) {
      return res.status(400).json({ error: 'CSV file contains no records' });
    }

    const mapRecordSimulated = (row, idx) => {
      let name = '';
      let email = '';
      let phone = '';
      let created_at = new Date().toISOString();
      let company = '';
      let city = '';
      let state = '';
      let country = 'India';
      let lead_owner = 'owner@groweasy.ai';
      let data_source = '';
      let crm_status = 'GOOD_LEAD_FOLLOW_UP';
      let crm_note = '';
      let possession_time = '';
      let description = '';

      // Helper to get directly mapped column values
      const getMappedValue = (field, defaultVal = '') => {
        if (mappings && mappings[field]) {
          const csvColName = mappings[field];
          if (row[csvColName] !== undefined && row[csvColName] !== null) {
            return (row[csvColName] + '').trim();
          }
        }
        return defaultVal;
      };

      name = getMappedValue('name', '');
      email = getMappedValue('email', '');
      phone = getMappedValue('mobile_without_country_code', '');
      created_at = getMappedValue('created_at', '');
      company = getMappedValue('company', '');
      city = getMappedValue('city', '');
      state = getMappedValue('state', '');
      country = getMappedValue('country', 'India');
      lead_owner = getMappedValue('lead_owner', 'owner@groweasy.ai');
      data_source = getMappedValue('data_source', '');
      crm_status = getMappedValue('crm_status', 'GOOD_LEAD_FOLLOW_UP');
      crm_note = getMappedValue('crm_note', '');
      possession_time = getMappedValue('possession_time', '');
      description = getMappedValue('description', '');

      // Apply regex fallbacks only for fields that were not directly resolved by the user's manual mapping
      for (const [key, value] of Object.entries(row)) {
        const k = key.toLowerCase();
        const v = (value || '').trim();
        if (!v) continue;

        if (k.includes('name') && !name) name = v;
        if (k.includes('email') && !email) email = v;
        if ((k.includes('phone') || k.includes('mobile') || k.includes('number') || k.includes('contact')) && !phone) phone = v;
        if ((k.includes('date') || k.includes('time') || k.includes('created')) && k !== 'possession_time' && (!created_at || created_at === new Date().toISOString())) created_at = v;
        if ((k.includes('company') || k.includes('org')) && !company) company = v;
        if ((k.includes('city') || k.includes('location')) && !city) city = v;
        if ((k.includes('campaign') || k.includes('source')) && !data_source) data_source = v;
        if ((k.includes('note') || k.includes('remark') || k.includes('comment')) && !crm_note) crm_note = v;
        if (k.includes('possession') && !possession_time) possession_time = v;
        if (k.includes('desc') && !description) description = v;
      }

      // Clean phone country code and main body
      let country_code = '+91';
      let mobile_without_country_code = phone;

      // Extract custom country code from mapped country_code column if provided
      const mappedCountryCode = getMappedValue('country_code', '');
      if (mappedCountryCode) {
        country_code = mappedCountryCode;
      } else if (phone && phone.trim().startsWith('+')) {
        const match = phone.match(/^(\+\d{1,3})\s*(.*)$/);
        if (match) {
          country_code = match[1];
          mobile_without_country_code = match[2];
        }
      }

      // Check skip criteria (skip if neither email nor phone is present)
      if (!email && !phone) {
        return null; // will be skipped
      }

      // Clean and normalize crm_status to one of the 4 allowed statuses
      let resolvedStatus = 'GOOD_LEAD_FOLLOW_UP';
      const rawStatusVal = (getMappedValue('crm_status', '') || crm_status || '').trim().toLowerCase();
      const rawNoteVal = (crm_note || '').trim().toLowerCase();
      
      const checkString = rawStatusVal || rawNoteVal;
      if (checkString.includes('busy') || checkString.includes('no answer') || checkString.includes('not connect') || checkString.includes('dialed') || checkString.includes('dial') || checkString.includes('unreachable')) {
        resolvedStatus = 'DID_NOT_CONNECT';
      } else if (checkString.includes('not interested') || checkString.includes('bad') || checkString.includes('wrong') || checkString.includes('junk') || checkString.includes('spam') || checkString.includes('trash') || checkString.includes('invalid')) {
        resolvedStatus = 'BAD_LEAD';
      } else if (checkString.includes('close') || checkString.includes('sold') || checkString.includes('won') || checkString.includes('done') || checkString.includes('convert') || checkString.includes('sale') || checkString.includes('complete')) {
        resolvedStatus = 'SALE_DONE';
      } else {
        resolvedStatus = 'GOOD_LEAD_FOLLOW_UP';
      }
      crm_status = resolvedStatus;

      // Enforce data source
      const allowedSources = ["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots"];
      let matchedSource = "";
      for (const src of allowedSources) {
        if (data_source.toLowerCase().includes(src.replace(/_/g, '')) || data_source.toLowerCase().includes(src)) {
          matchedSource = src;
          break;
        }
      }

      return {
        created_at: created_at || new Date().toISOString(),
        name: name || `Lead ${idx + 1}`,
        email: email || '',
        country_code,
        mobile_without_country_code: mobile_without_country_code || '',
        company: company || 'Company',
        city: city || 'City',
        state: state || '',
        country: country || 'India',
        lead_owner: lead_owner || 'owner@groweasy.ai',
        crm_status,
        crm_note: crm_note,
        data_source: matchedSource || (allowedSources.includes(data_source) ? data_source : 'leads_on_demand'),
        possession_time,
        description
      };
    };

    // If API client is not initialized, run in simulation mode
    if (!ai) {
      console.log("Running in Simulation Mode (No GEMINI_API_KEY set)");
      const simulatedRecords = validRawRecords.map((row, idx) => mapRecordSimulated(row, idx)).filter(Boolean);
      const totalImported = simulatedRecords.length;
      const totalSkipped = validRawRecords.length - totalImported;

      return res.json({
        success: true,
        summary: {
          totalRecords: validRawRecords.length,
          totalImported,
          totalSkipped,
        },
        records: simulatedRecords,
        skipped: validRawRecords.filter(row => {
          let email = '';
          let phone = '';
          
          if (mappings && mappings.email) {
            email = row[mappings.email];
          }
          if (mappings && mappings.mobile_without_country_code) {
            phone = row[mappings.mobile_without_country_code];
          }
          
          // Fallback if not mapped
          if (!email && (!mappings || !mappings.email)) {
            for (const [key, value] of Object.entries(row)) {
              if (key.toLowerCase().includes('email')) email = value;
            }
          }
          if (!phone && (!mappings || !mappings.mobile_without_country_code)) {
            for (const [key, value] of Object.entries(row)) {
              if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile') || key.toLowerCase().includes('number')) phone = value;
            }
          }
          
          return !email && !phone;
        }).map(row => ({ record: row, reason: 'Missing both email and phone number' }))
      });
    }

    // AI Extraction Mode using Gemini 2.0 Flash
    const batches = batchArray(validRawRecords, 10);
    const allMappedRecords = [];
    const skippedRecords = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}...`);

      let mappingInstructions = '';
      if (mappings) {
        mappingInstructions = `
CRITICAL: The user has specified the following column mappings for this spreadsheet:
${Object.entries(mappings).filter(([_, val]) => !!val).map(([crmField, csvCol]) => `- CRM field "${crmField}" should be extracted from CSV column "${csvCol}"`).join('\n')}

Please prioritize using these specified column mappings to populate the respective fields. If a field is not mapped, use your semantic analysis to determine if it should be extracted from other columns.
`;
      }

      const prompt = `
Please map this batch of parsed CSV records into the standard CRM format.
Here is the batch of raw records:
${JSON.stringify(batch, null, 2)}
${mappingInstructions}

Return ONLY a JSON array containing the mapped objects. Each object should have keys:
"created_at", "name", "email", "country_code", "mobile_without_country_code", "company", "city", "state", "country", "lead_owner", "crm_status", "crm_note", "data_source", "possession_time", "description".
If any record is missing both email and phone, output it with name: null and email: null, so that we can skip it.
`;

      try {
        const response = await callGeminiWithRetry(prompt, SYSTEM_INSTRUCTION);

        const textResponse = response.text || '';
        let mappedBatch = JSON.parse(textResponse.trim());
        
        if (!Array.isArray(mappedBatch)) {
          if (mappedBatch.leads && Array.isArray(mappedBatch.leads)) {
            mappedBatch = mappedBatch.leads;
          } else if (mappedBatch.records && Array.isArray(mappedBatch.records)) {
            mappedBatch = mappedBatch.records;
          } else {
            console.error("Gemini response is not an array:", mappedBatch);
            mappedBatch = [];
          }
        }

        // Apply rules and validate
        mappedBatch.forEach((record, index) => {
          const originalRecord = batch[index] || {};
          
          const hasEmail = record.email && record.email.trim() !== '';
          const hasMobile = record.mobile_without_country_code && record.mobile_without_country_code.trim() !== '';

          if (!hasEmail && !hasMobile) {
            skippedRecords.push({
              record: originalRecord,
              reason: 'Missing both email and phone number'
            });
          } else {
            const allowedStatuses = ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"];
            if (!allowedStatuses.includes(record.crm_status)) {
              record.crm_status = "GOOD_LEAD_FOLLOW_UP";
            }

            const allowedSources = ["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots"];
            if (record.data_source && !allowedSources.includes(record.data_source)) {
              record.data_source = "";
            }

            if (record.created_at) {
              try {
                const dateObj = new Date(record.created_at);
                if (isNaN(dateObj.getTime())) {
                  record.created_at = new Date().toISOString();
                }
              } catch (e) {
                record.created_at = new Date().toISOString();
              }
            } else {
              record.created_at = new Date().toISOString();
            }

            allMappedRecords.push(record);
          }
        });

      } catch (err) {
        console.warn(`Error in batch ${batchIndex + 1} (Failing back to simulated mapping):`, err.message);
        // Fallback mapping for this batch due to API issues
        batch.forEach((row, idx) => {
          const simulatedRecord = mapRecordSimulated(row, batchIndex * 10 + idx);
          if (simulatedRecord) {
            allMappedRecords.push(simulatedRecord);
          } else {
            skippedRecords.push({
              record: row,
              reason: 'Missing both email and phone number (Skipped during fallback mapping)'
            });
          }
        });
      }
    }

    let newlyImportedCount = 0;
    const uniqueNewRecords = [];

    try {
      const existingLeads = await loadLeadsFromDatabase();
      
      allMappedRecords.forEach(newLead => {
        const isDuplicate = checkIsDuplicate(newLead, existingLeads);
        
        if (!isDuplicate) {
          uniqueNewRecords.push(newLead);
          newlyImportedCount++;
        } else {
          skippedRecords.push({
            record: { 
              name: newLead.name, 
              email: newLead.email, 
              mobile_without_country_code: newLead.mobile_without_country_code,
              company: newLead.company
            },
            reason: 'Duplicate lead (already exists in database)'
          });
        }
      });
      
      await insertLeads(uniqueNewRecords);
      
      allMappedRecords.length = 0;
      allMappedRecords.push(...uniqueNewRecords);
      
    } catch (dbErr) {
      console.error('Error saving records to database:', dbErr);
    }

    const totalImported = newlyImportedCount;
    const totalSkipped = skippedRecords.length;

    res.json({
      success: true,
      summary: {
        totalRecords: validRawRecords.length,
        totalImported,
        totalSkipped,
      },
      records: allMappedRecords,
      skipped: skippedRecords
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Server error processing CSV file', details: error.message });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    const leads = await loadLeadsFromDatabase();
    res.json({
      success: true,
      count: leads.length,
      records: leads
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve leads', details: err.message });
  }
});

// Update single lead status in database
// NOTE: Add authentication middleware here before deploying to production.
app.post('/api/leads/update-status', async (req, res) => {
  const { email, mobile_without_country_code, crm_status } = req.body;

  // Validate types
  if (email !== undefined && typeof email !== 'string') {
    return res.status(400).json({ error: 'Email must be a string' });
  }
  if (mobile_without_country_code !== undefined && typeof mobile_without_country_code !== 'string') {
    return res.status(400).json({ error: 'mobile_without_country_code must be a string' });
  }

  // Validate non-empty identifiers to prevent matching empty fields
  const hasEmail = typeof email === 'string' && email.trim() !== '';
  const hasMobile = typeof mobile_without_country_code === 'string' && mobile_without_country_code.trim() !== '';
  if (!hasEmail && !hasMobile) {
    return res.status(400).json({ error: 'At least one identifier (email or mobile_without_country_code) must be provided and non-empty' });
  }

  const allowedStatuses = ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"];
  if (typeof crm_status !== 'string' || !allowedStatuses.includes(crm_status)) {
    return res.status(400).json({ error: 'crm_status is invalid or missing' });
  }

  try {
    await updateLeadStatus(email, mobile_without_country_code, crm_status);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead status', details: err.message });
  }
});

app.post('/api/leads/update-note', async (req, res) => {
  const { email, mobile_without_country_code, crm_note } = req.body;

  if (email !== undefined && typeof email !== 'string') {
    return res.status(400).json({ error: 'Email must be a string' });
  }
  if (mobile_without_country_code !== undefined && typeof mobile_without_country_code !== 'string') {
    return res.status(400).json({ error: 'mobile_without_country_code must be a string' });
  }

  const hasEmail = typeof email === 'string' && email.trim() !== '';
  const hasMobile = typeof mobile_without_country_code === 'string' && mobile_without_country_code.trim() !== '';
  if (!hasEmail && !hasMobile) {
    return res.status(400).json({ error: 'At least one identifier (email or mobile_without_country_code) must be provided and non-empty' });
  }

  if (typeof crm_note !== 'string') {
    return res.status(400).json({ error: 'crm_note must be a string' });
  }

  try {
    await updateLeadNote(email, mobile_without_country_code, crm_note);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead note', details: err.message });
  }
});

app.post('/api/leads/delete', async (req, res) => {
  const { email, mobile_without_country_code } = req.body;

  if (email !== undefined && typeof email !== 'string') {
    return res.status(400).json({ error: 'Email must be a string' });
  }
  if (mobile_without_country_code !== undefined && typeof mobile_without_country_code !== 'string') {
    return res.status(400).json({ error: 'mobile_without_country_code must be a string' });
  }

  const hasEmail = typeof email === 'string' && email.trim() !== '';
  const hasMobile = typeof mobile_without_country_code === 'string' && mobile_without_country_code.trim() !== '';
  if (!hasEmail && !hasMobile) {
    return res.status(400).json({ error: 'At least one identifier (email or mobile_without_country_code) must be provided and non-empty' });
  }

  try {
    await deleteLead(email, mobile_without_country_code);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead', details: err.message });
  }
});

// Route to generate simulated leads for testing and CRM environment realism
app.post('/api/leads/generate', async (req, res) => {
  try {
    const { campaign, count, quality } = req.body;
    const numCount = parseInt(count) || 5;
    
    const firstNames = ["Amit", "Rohan", "Suresh", "Vijay", "Anjali", "Sonia", "Neha", "Deepak", "Raj", "Vikram", "Priya", "Karan", "Aditya", "Meera", "Sunita", "Rahul", "Pooja", "Arjun"];
    const lastNames = ["Kumar", "Sharma", "Patel", "Nair", "Mishra", "Reddy", "Rao", "Shah", "Mehta", "Joshi", "Roy", "Sen", "Verma", "Gupta", "Singh", "Das"];
    const companies = ["TechSolutions Co", "Random Corp", "Startup.in", "Digital India Corp", "Fintech Labs", "Apex Ventures", "Delta Systems"];
    const cities = ["Mumbai", "Pune", "Chennai", "Ahmedabad", "Hyderabad", "Bangalore", "Delhi", "Kolkata", "Noida", "Gurugram"];
    const states = ["Maharashtra", "Maharashtra", "Tamil Nadu", "Gujarat", "Telangana", "Karnataka", "Delhi", "West Bengal", "Uttar Pradesh", "Haryana"];
    
    const newLeads = [];
    const existingLeads = await loadLeadsFromDatabase();
    
    for (let i = 0; i < numCount; i++) {
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      const name = `${fn} ${ln}`;
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(Math.random() * 1000)}@${companies[Math.floor(Math.random() * companies.length)].toLowerCase().replace(/\s+/g, '')}.com`;
      const phone = `+91 ${9000000000 + Math.floor(Math.random() * 999999999)}`;
      
      const cityIdx = Math.floor(Math.random() * cities.length);
      const city = cities[cityIdx];
      const state = states[cityIdx];
      
      let crm_status = "GOOD_LEAD_FOLLOW_UP";
      if (quality === "mostly_interested") {
        crm_status = Math.random() > 0.3 ? "GOOD_LEAD_FOLLOW_UP" : "SALE_DONE";
      } else if (quality === "mostly_junk") {
        crm_status = Math.random() > 0.3 ? "BAD_LEAD" : "DID_NOT_CONNECT";
      } else {
        const statuses = ["GOOD_LEAD_FOLLOW_UP", "SALE_DONE", "DID_NOT_CONNECT", "BAD_LEAD"];
        crm_status = statuses[Math.floor(Math.random() * statuses.length)];
      }
      
      let crm_note = `Generated from Simulator Campaign: ${campaign}.`;
      if (crm_status === "DID_NOT_CONNECT") crm_note += " Call back scheduled.";
      else if (crm_status === "BAD_LEAD") crm_note += " Wrong number/Spam lead.";
      
      newLeads.push({
        created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        name,
        email,
        country_code: "+91",
        mobile_without_country_code: phone.split(' ')[1],
        company: companies[Math.floor(Math.random() * companies.length)],
        city,
        state,
        country: "India",
        lead_owner: "agent.allocator@groweasy.ai",
        crm_status,
        crm_note,
        data_source: campaign || "leads_on_demand",
        possession_time: "Immediate",
        description: `Automated campaign lead.`
      });
    }
    
    const uniqueGeneratedLeads = [];
    newLeads.forEach(newLead => {
      const isDuplicate = checkIsDuplicate(newLead, existingLeads);
      
      if (!isDuplicate) {
        uniqueGeneratedLeads.push(newLead);
      }
    });
    
    await insertLeads(uniqueGeneratedLeads);
    
    res.json({
      success: true,
      count: uniqueGeneratedLeads.length,
      records: uniqueGeneratedLeads
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate leads", details: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const count = await getLeadsCount();
    res.json({ 
      status: 'ok', 
      ai_enabled: !!ai,
      mode: ai ? 'AI-powered' : 'Simulation Mode (No GEMINI_API_KEY)',
      leadsCount: count
    });
  } catch (err) {
    res.status(500).json({ error: 'Health check failed', details: err.message });
  }
});

let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    console.log(`GrowEasy Backend listening at http://localhost:${port}`);
  });
}

if (process.env.NODE_ENV === 'test') {
  module.exports = {
    app,
    isLeadMatch,
    checkIsDuplicate,
    loadLeadsFromDatabase,
    insertLeads,
    updateLeadStatus,
    updateLeadNote,
    deleteLead,
    db
  };
}
