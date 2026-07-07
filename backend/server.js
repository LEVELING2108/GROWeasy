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

const dbPath = path.join(__dirname, 'leads_db.json');

function loadLeadsFromDatabase() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load leads database:', err);
  }
  return [];
}

// Sequential write queue to prevent concurrent writes from clobbering each other
let writeQueue = Promise.resolve();

function saveLeadsToDatabase(leads) {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(() => {
      try {
        fs.writeFileSync(dbPath, JSON.stringify(leads, null, 2), 'utf8');
        resolve();
      } catch (err) {
        console.error('Failed to save leads database:', err);
        reject(err);
      }
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
  } else if (hasEmail) {
    return emailMatch;
  } else if (hasMobile) {
    return mobileMatch;
  }
  return false;
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

// Helper to call Gemini with retry mechanism (Exponential backoff)
const callGeminiWithRetry = async (prompt, systemInstruction, retries = 2, delayMs = 1000) => {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
        }
      });
      return response;
    } catch (err) {
      if (attempt > retries) {
        throw err; // Exhausted all retries
      }
      console.warn(`Gemini API Call Attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // Double the delay (exponential backoff)
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

    // Filter out records that are completely empty
    const validRawRecords = rawRecords.filter(row => {
      // Must have some data
      return Object.values(row).some(val => val && val.trim() !== '');
    });

    if (validRawRecords.length === 0) {
      return res.status(400).json({ error: 'CSV file contains no records' });
    }

    // Helper function for simulated fallback mapping
    const mapRecordSimulated = (row, idx, fallbackMode = false) => {
      let name = '';
      let email = '';
      let phone = '';
      let created_at = new Date().toISOString();
      let company = '';
      let city = '';
      let data_source = '';
      let crm_status = 'GOOD_LEAD_FOLLOW_UP';
      let crm_note = '';
      let possession_time = '';
      let description = '';

      for (const [key, value] of Object.entries(row)) {
        const k = key.toLowerCase();
        const v = (value || '').trim();
        if (!v) continue;
        if (k.includes('name') && !name) name = v;
        if (k.includes('email') && !email) email = v;
        if ((k.includes('phone') || k.includes('mobile') || k.includes('number') || k.includes('contact')) && !phone) phone = v;
        if ((k.includes('date') || k.includes('time') || k.includes('created')) && k !== 'possession_time') created_at = v;
        if (k.includes('company') || k.includes('org')) company = v;
        if (k.includes('city') || k.includes('location')) city = v;
        if (k.includes('campaign') || k.includes('source')) data_source = v;
        if (k.includes('note') || k.includes('remark') || k.includes('comment')) crm_note = v;
        if (k.includes('possession')) possession_time = v;
        if (k.includes('desc')) description = v;
      }

      // Clean phone
      let country_code = '+91';
      let mobile_without_country_code = phone;
      if (phone && phone.trim().startsWith('+')) {
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

      // Validate crm_status classification dynamically from note/status if present
      const noteLower = crm_note.toLowerCase();
      if (noteLower.includes('busy') || noteLower.includes('no answer') || noteLower.includes('not connect')) {
        crm_status = 'DID_NOT_CONNECT';
      } else if (noteLower.includes('not interested') || noteLower.includes('bad') || noteLower.includes('wrong')) {
        crm_status = 'BAD_LEAD';
      } else if (noteLower.includes('close') || noteLower.includes('sold') || noteLower.includes('won') || noteLower.includes('done')) {
        crm_status = 'SALE_DONE';
      }

      // Enforce data source
      const allowedSources = ["leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots"];
      let matchedSource = "";
      for (const src of allowedSources) {
        if (data_source.toLowerCase().includes(src.replace(/_/g, '')) || data_source.toLowerCase().includes(src)) {
          matchedSource = src;
          break;
        }
      }

      const statusNote = fallbackMode 
        ? '[Fallback: Gemini API rate limited. Deterministic map used.] ' 
        : 'Simulated mapping (Set active GEMINI_API_KEY to use AI). ';

      return {
        created_at,
        name: name || `Lead ${idx + 1}`,
        email: email || '',
        country_code,
        mobile_without_country_code: mobile_without_country_code || '',
        company: company || 'Company',
        city: city || 'City',
        state: '',
        country: 'India',
        lead_owner: 'owner@groweasy.ai',
        crm_status,
        crm_note: statusNote + crm_note,
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
          for (const [key, value] of Object.entries(row)) {
            const k = key.toLowerCase();
            if (k.includes('email')) email = value;
            if (k.includes('phone') || k.includes('mobile') || k.includes('number')) phone = value;
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

      const prompt = `
Please map this batch of parsed CSV records into the standard CRM format.
Here is the batch of raw records:
${JSON.stringify(batch, null, 2)}

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
          const simulatedRecord = mapRecordSimulated(row, batchIndex * 10 + idx, true);
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

    // Persist to local JSON file database with de-duplication
    let newlyImportedCount = 0;
    const uniqueNewRecords = [];

    try {
      const existingLeads = loadLeadsFromDatabase();
      
      allMappedRecords.forEach(newLead => {
        const isDuplicate = existingLeads.some(existing => {
          const emailMatch = newLead.email && existing.email && 
                             newLead.email.trim().toLowerCase() === existing.email.trim().toLowerCase();
          const phoneMatch = newLead.mobile_without_country_code && existing.mobile_without_country_code && 
                             newLead.mobile_without_country_code.trim() === existing.mobile_without_country_code.trim();
          
          // Match by email is direct duplicate
          if (emailMatch) return true;
          
          // Match by phone is duplicate only if name also matches, or if both lack email
          if (phoneMatch) {
            const nameMatch = newLead.name && existing.name &&
                              newLead.name.trim().toLowerCase() === existing.name.trim().toLowerCase();
            return nameMatch || (!newLead.email && !existing.email);
          }
          
          return false;
        });
        
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
      
      const combined = [...uniqueNewRecords, ...existingLeads];
      await saveLeadsToDatabase(combined);
      
      // Update the reference array in-place so client receives only the newly added records
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

// Retrieve persisted leads from database
// NOTE: Add authentication middleware here before deploying to production.
app.get('/api/leads', (req, res) => {
  try {
    const leads = loadLeadsFromDatabase();
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
    const leads = loadLeadsFromDatabase();
    const updated = leads.map(l => {
      if (isLeadMatch(l, email, mobile_without_country_code)) {
        return { ...l, crm_status };
      }
      return l;
    });
    await saveLeadsToDatabase(updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead status', details: err.message });
  }
});

// Update single lead note in database
// NOTE: Add authentication middleware here before deploying to production.
app.post('/api/leads/update-note', async (req, res) => {
  const { email, mobile_without_country_code, crm_note } = req.body;

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

  if (typeof crm_note !== 'string') {
    return res.status(400).json({ error: 'crm_note must be a string' });
  }

  try {
    const leads = loadLeadsFromDatabase();
    const updated = leads.map(l => {
      if (isLeadMatch(l, email, mobile_without_country_code)) {
        return { ...l, crm_note };
      }
      return l;
    });
    await saveLeadsToDatabase(updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead note', details: err.message });
  }
});

// Delete lead from database
// NOTE: Add authentication middleware here before deploying to production.
app.post('/api/leads/delete', async (req, res) => {
  const { email, mobile_without_country_code } = req.body;

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

  try {
    const leads = loadLeadsFromDatabase();
    const filtered = leads.filter(l => !isLeadMatch(l, email, mobile_without_country_code));
    await saveLeadsToDatabase(filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead', details: err.message });
  }
});

// Server status route
app.get('/api/health', (req, res) => {
  try {
    res.json({ 
      status: 'ok', 
      ai_enabled: !!ai,
      mode: ai ? 'AI-powered' : 'Simulation Mode (No GEMINI_API_KEY)',
      leadsCount: loadLeadsFromDatabase().length
    });
  } catch (err) {
    res.status(500).json({ error: 'Health check failed', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`GrowEasy Backend listening at http://localhost:${port}`);
});
