// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- Google Sheets API Setup (JWT, Render-safe) ---
const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'credentials.json');

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
} catch (err) {
  console.error(`Failed to load credentials.json from ${keyPath}`, err);
  process.exit(1);
}

// Create JWT auth client
const auth = new google.auth.JWT(
  credentials.client_email,    // Service account email
  null,
  credentials.private_key,     // Private key from JSON
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

// --- Google Gemini API Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- Test Endpoint to Verify Sheets Access ---
app.get('/api/test-sheets', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'A1:A1',
    });
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('Sheets API test error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Generate Content Endpoint ---
app.post('/api/generate', async (req, res) => {
  try {
    const { tasks } = req.body;
    if (!tasks || tasks.trim() === '') {
      return res.status(400).json({ error: 'Tasks input cannot be empty.' });
    }

    // 1. Generate content with Gemini AI
    const prompt = `
      You are a professional productivity assistant. Based on the following raw list of tasks,
      first, create a prioritized "Plan for Today" in a logical order.
      Second, using that plan, draft a professional and concise work update email template.
      The email should be ready to be copied and sent.

      Separate the plan and the email with "---EMAIL---".

      Tasks:
      ${tasks}`;

    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();
    const [plan, email] = responseText.split('---EMAIL---');

    // 2. Append to Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'A1:D1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[new Date().toISOString(), tasks, plan.trim(), email.trim()]],
      },
    });

    // 3. Return result to frontend
    res.json({
      plan: plan.trim(),
      email: email.trim(),
    });
  } catch (err) {
    console.error('Error generating content or writing to Sheets:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Start Server ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
