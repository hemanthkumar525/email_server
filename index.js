// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// --- Google Sheets API Setup ---
const auth = new google.auth.GoogleAuth({
  keyFile:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, 'credentials.json'), // Local fallback
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Google Gemini API Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- API Endpoint ---
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

    // 2. Log the data to Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'A1:D1', // The sheet will automatically find the next empty row
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[new Date().toISOString(), tasks, plan.trim(), email.trim()]],
      },
    });

    // 3. Send the generated email back to the frontend
    res.json({
      plan: plan.trim(),
      email: email.trim(),
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate content.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
