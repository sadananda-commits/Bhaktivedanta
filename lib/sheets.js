import { google } from 'googleapis';

/**
 * Returns an authenticated Google Sheets client.
 *
 * Supports two auth methods (checked in order):
 *  1. Service Account JSON key  → set GOOGLE_SERVICE_ACCOUNT_JSON env var
 *  2. OAuth2 refresh token      → set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *                                  GOOGLE_REFRESH_TOKEN env vars (legacy)
 */
export function getSheetsClient() {
  // ── Method 1: Service Account (recommended) ──────────────────────────────
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth });
  }

  // ── Method 2: OAuth2 refresh token (legacy fallback) ─────────────────────
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.sheets({ version: 'v4', auth: oauth2Client });
  }

  throw new Error(
    'Google Sheets auth not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON ' +
    '(or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN) in your .env.local'
  );
}

export const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
