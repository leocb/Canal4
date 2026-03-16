import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// SMTP Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.post('/api/request-pin', async (req, res) => {
  console.log('POST /api/request-pin', req.body);
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  // Valid for 10 minutes
  const expiresAtMillis = Date.now() + 10 * 60 * 1000;

  const DB_NAME = process.env.VITE_SPACETIMEDB_NAME;
  let URI = process.env.VITE_SPACETIMEDB_URI_DEV || 'http://localhost:3000';

  // Convert ws:// to http:// for REST call
  const restUri = URI.replace('ws://', 'http://').replace('wss://', 'https://');

  try {
    // 1. Store PIN in SpacetimeDB via REST API
    // The format for timestamp in JSON is { "micros": "string" }

    console.log(`[Server] Requesting PIN for ${email}: ${pin}`);

    const backendToken = process.env.SPACETIMEDB_SERVER_PRIVATE_KEY;
    // SpacetimeDB REST API expects flat arguments in the order defined.
    // Timestamps are represented as [micros] (1-element array).
    const body = [
      email.trim().toLowerCase(),
      pin,
      [Number(BigInt(expiresAtMillis) * 1000n)],
      backendToken
    ];

    const stdbResponse = await fetch(`${restUri}/v1/database/${DB_NAME}/call/set_email_login_pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!stdbResponse.ok) {
      const error = await stdbResponse.text();
      console.error('SpacetimeDB Error:', error);
      return res.status(500).json({ error: `Failed to store PIN: ${error}` });
    }

    // 2. Send email (Dev mode: Log to console, Prod mode: Send via SMTP)
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

    if (isDev) {
      console.log(`Email: ${email} - PIN: ${pin}`);
    } else {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Canal4 Login PIN" <noreply@example.com>',
        to: email,
        subject: 'Login PIN for Canal4',
        text: `Your login PIN is: ${pin}. It is valid for 10 minutes.`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">Canal4</h2>
          <p>Your login PIN is:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 15px; background: #f4f4f4; border-radius: 5px; text-align: center;">
            ${pin}
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            This PIN is valid for 10 minutes. If you did not request this, please ignore this email.
          </p>
        </div>`,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Send all other requests to the React app
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});
