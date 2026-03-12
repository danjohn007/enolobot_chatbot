// config.js (ESM)
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

// Re-export Firebase Functions utilities
export { onRequest, logger };

// Define secrets
export const VERIFY_TOKEN = defineSecret("VERIFY_TOKEN_MAJORBOT");//  278267
export const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN_MAJORBOT");//  EAAZAi58LtD6MBPkf5QmfWqJYMhxQVwY0XApZB1WokzWIJOEMC5jimrTZBVglckeLwQgTXbcXNQuaTpOVaeXcxTZAK1ZB2aCJUZBBVa7iK5zfhiuy6cPWCaS2zsmZCmpYJLdgbPCZBnbtHF3kFT6pL0x1vEiRlgtxzWnfb12TMYhDPbkDn22JTgZAZCjAehCKqs3gZDZD
export const WHATSAPP_PHONE_NUMBER_ID = defineSecret("WHATSAPP_PHONE_NUMBER_ID_MAJORBOT");//  799834809882870

export const DB_HOST = defineSecret("DB_HOST_MAJORBOT");//  ranchoparaisoreal.com
export const DB_USER = defineSecret("DB_USER_MAJORBOT");//  ranchopa_sistema
export const DB_PASSWORD = defineSecret("DB_PASSWORD_MAJORBOT");//  Danjohn007!
export const DB_NAME = defineSecret("DB_NAME_MAJORBOT");//  ranchopa_sistema
export const BASE_MEDIA_URL = defineSecret("BASE_MEDIA_URL_MAJORBOT");//  https://ranchoparaisoreal.com/majorbot/public/

// Firebase Function options
export const FN_OPTIONS = {
  cors: true,
  region: "us-central1",
  secrets: [
    VERIFY_TOKEN,
    WHATSAPP_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    BASE_MEDIA_URL
  ],
};

// Normalizador JSON seguro (utilidad transversal)
export function safeJson(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

// Constants
export const WIZARD_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const AMENITY_FLOW_STATES = new Set(['email', 'date', 'time', 'party', 'confirm']);
export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const MYSQL_TABLE_NOT_FOUND = 'ER_NO_SUCH_TABLE';