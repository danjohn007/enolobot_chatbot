// wa.js - WhatsApp API helpers
import axios from "axios";
import { logger } from "./config.js";

export async function sendWhatsAppText({ to, text, token, phoneNumberId }) {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  await axios.post(url, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  }, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: 15000,
  });
}

export async function sendWhatsAppImage({ to, imageUrl, caption, token, phoneNumberId }) {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  await axios.post(url, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, caption: caption || '' },
  }, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: 15000,
  });
}

export async function sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId }) {
  return sendWhatsAppImage({ to, imageUrl, caption, token, phoneNumberId });
}

export async function sendInteractiveButtons({ to, body, buttons, token, phoneNumberId }) {
  // Validate button count (1-3)
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
    logger.error('[wa] invalid buttons count', { count: buttons?.length });
    // Fallback to text message to avoid breaking conversation
    return sendWhatsAppText({ to, text: body, token, phoneNumberId });
  }
  
  // Normalize and validate buttons (title max 20 chars, id max 256 chars)
  const safeButtons = buttons.map(b => ({
    type: "reply",
    reply: {
      id: String(b.id || '').slice(0, 256),
      title: String(b.title || '').slice(0, 20)
    }
  }));
  
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  
  try {
    await axios.post(url, {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: safeButtons }
      },
    }, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 15000,
    });
  } catch (err) {
    // Log detailed error information for debugging
    const data = err?.response?.data;
    logger.error('[wa] sendButtons error', { 
      status: err?.response?.status, 
      data,
      buttonCount: safeButtons.length,
      buttons: safeButtons.map(b => ({ id: b.reply.id, titleLen: b.reply.title.length }))
    });
    
    // Fallback to text message with instructions
    await sendWhatsAppText({ 
      to, 
      text: body + '\n\n(Responde: "confirmar", "editar", o "cancelar")', 
      token, 
      phoneNumberId 
    });
  }
}

export async function sendInteractiveList({ to, header, body, footer, buttonText = "Ver opciones", rows, token, phoneNumberId }) {
  // Validate rows (WhatsApp requires at least 1 row, max 10 per section)
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10) {
    logger.error('[wa] invalid rows count for list', { count: rows?.length });
    // Fallback to text message
    const optionsText = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
    return sendWhatsAppText({ 
      to, 
      text: `${body}\n\n${optionsText}\n\nResponde con el número de la opción que desees.`, 
      token, 
      phoneNumberId 
    });
  }
  
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  
  // Normalize rows (title max 24 chars, description max 72 chars, id max 200 chars)
  const safeRows = rows.map(r => {
    const row = {
      id: String(r.id || '').slice(0, 200),
      title: String(r.title || '').slice(0, 24)
    };
    if (r.description) {
      row.description = String(r.description).slice(0, 72);
    }
    return row;
  });
  
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: header ? { type: "text", text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        button: buttonText,
        sections: [
          {
            title: "Opciones",
            rows: safeRows,
          },
        ],
      },
    },
  };
  
  // Remove undefined fields
  if (!payload.interactive.header) delete payload.interactive.header;
  if (!payload.interactive.footer) delete payload.interactive.footer;
  
  try {
    logger.info('[wa] sending list', { to, rowCount: safeRows.length, buttonText });
    
    await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 15000,
    });
    
    logger.info('[wa] list sent successfully', { to });
  } catch (err) {
    // Log detailed error information for debugging
    const data = err?.response?.data;
    logger.error('[wa] sendList error', { 
      status: err?.response?.status, 
      data,
      rowCount: safeRows.length,
      rows: safeRows.map(r => ({ id: r.id, titleLen: r.title.length, hasDesc: !!r.description }))
    });
    
    // Fallback to text message with numbered options
    const optionsText = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
    await sendWhatsAppText({ 
      to, 
      text: `${body}\n\n${optionsText}\n\nResponde con el número de la opción que desees.`, 
      token, 
      phoneNumberId 
    });
  }
}

// === Queue mechanism for message ordering ===
const sendQueues = new Map();

export function enqueueSend(to, job) {
  let q = sendQueues.get(to);
  if (!q) {
    q = Promise.resolve();
    sendQueues.set(to, q);
  }
  sendQueues.set(to, q.then(job).catch(() => {}));
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sendMediaSequence({ to, items, token, phoneNumberId, buildCaption, buildImageUrl, perItemDelayMs = 1200 }) {
  for (const item of items) {
    const caption = buildCaption(item);
    const imageUrl = buildImageUrl(item.__imagePath);
    
    if (imageUrl) {
      try {
        await sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId });
      } catch {
        await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
      }
    } else {
      await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
    }
    
    if (perItemDelayMs > 0) {
      await delay(perItemDelayMs);
    }
  }
}