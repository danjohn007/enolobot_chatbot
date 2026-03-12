// Node 22, ESM - Minimal entrypoint
import { onRequest, logger, FN_OPTIONS, VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, BASE_MEDIA_URL } from "./config.js";
import { handleWebhook } from "./router.js";
import { getPool, ensureConversationTables } from "./db.js";

// Set up HOTEL_KEY from environment if available
if (!process.env.HOTEL_KEY) {
  // Try to get from Firebase config or use default
  try {
    const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
    process.env.HOTEL_KEY = firebaseConfig?.app?.hotel_key || 'majorbot';
  } catch {
    process.env.HOTEL_KEY = 'majorbot';
  }
}

// Initialize conversation tables on startup
let tablesInitialized = false;

export const whatsappWebhook_MajorBot = onRequest(FN_OPTIONS, async (req, res) => {
  try {
    const cfg = {
      VERIFY_TOKEN: VERIFY_TOKEN.value(),
      WHATSAPP_TOKEN: WHATSAPP_TOKEN.value(),
      WHATSAPP_PHONE_NUMBER_ID: WHATSAPP_PHONE_NUMBER_ID.value(),
      DB_HOST: DB_HOST.value(),
      DB_USER: DB_USER.value(),
      DB_PASSWORD: DB_PASSWORD.value(),
      DB_NAME: DB_NAME.value(),
      BASE_MEDIA_URL: BASE_MEDIA_URL.value(),
    };

    logger.info({ baseMediaUrl: cfg.BASE_MEDIA_URL });

    // Ensure conversation tables exist (only once)
    if (!tablesInitialized) {
      const pool = getPool(cfg);
      await ensureConversationTables(pool);
      tablesInitialized = true;
    }

    await handleWebhook(req, res, cfg);
  } catch (err) {
    logger.error('webhook_error', { 
      msg: err.message, 
      code: err.code, 
      sql: err.sqlMessage,
      stack: err.stack 
    });
    // Respond 200 to prevent Meta from retrying in loop
    res.sendStatus(200);
  }
});