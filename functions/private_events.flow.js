// private_events.flow.js - Private events information flow
import { logger } from "./config.js";
import { sendWhatsAppText } from "./wa.js";
import { 
  createPrivateEventDraft,
  getPrivateEventDraft,
  updatePrivateEventDraft
} from "./db.js";
import { normalizeUserText } from "./price.js";

const PRIVATE_EVENTS_CONTACT = '441 138 8731';
const PRIVATE_EVENTS_PERSON = 'nuestro equipo de eventos';

// === Start private events flow ===
export async function startPrivateEventsFlow({ to, token, phoneNumberId, pool }) {
  try {
    logger.info({ svc: 'private_events', step: 'start', to });
    
    // Create draft
    const draft = await createPrivateEventDraft(pool, { 
      phone: to, 
      step: 'awaiting_name' 
    });
    
    await sendWhatsAppText({
      to,
      text: "¿Con quién tengo el gusto (Nombre y apellido)?",
      token,
      phoneNumberId
    });
    
    return true;
  } catch (err) {
    logger.error('startPrivateEventsFlow failed', { err: err.message });
    await sendWhatsAppText({
      to,
      text: 'Ocurrió un error. Intenta de nuevo.',
      token,
      phoneNumberId
    });
  }
}

// === Handle private events text input ===
export async function handlePrivateEventsText({ to, text, pool, token, phoneNumberId }) {
  try {
    const draft = await getPrivateEventDraft(pool, to);
    if (!draft) return false;
    
    const step = draft.step || '';
    logger.info({ svc: 'private_events', step, text: normalizeUserText(text) });
    
    // Step: awaiting_name
    if (step === 'awaiting_name') {
      const name = normalizeUserText(text);
      if (!name || name.length < 3) {
        await sendWhatsAppText({
          to,
          text: "Por favor, escribe tu nombre completo.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updatePrivateEventDraft(pool, draft.id, { 
        customer_name: name,
        step: 'completed'
      });
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${name},\n\nEn el número *${PRIVATE_EVENTS_CONTACT}* te atenderá ${PRIVATE_EVENTS_PERSON} con mucho gusto para informarte sobre nuestros eventos privados. 🎉🍷`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handlePrivateEventsText failed', { err: err.message });
    return false;
  }
}
