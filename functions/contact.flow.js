// contact.flow.js - Contact administration flow
import { logger } from "./config.js";
import { 
  sendWhatsAppText, 
  sendInteractiveButtons
} from "./wa.js";
import { 
  createContactDraft,
  getContactDraft,
  updateContactDraft
} from "./db.js";
import { normalizeUserText } from "./price.js";

// Contact numbers for each department
const CONTACT_NUMBERS = {
  facturacion: '441-XXX-XXXX',
  gerencia: '441-XXX-XXXX',
  servicio_cliente: '441-XXX-XXXX',
  seguridad: '441-XXX-XXXX',
  tienda: '441-XXX-XXXX'
};

// === Start contact flow ===
export async function startContactFlow({ to, token, phoneNumberId, pool }) {
  try {
    logger.info({ svc: 'contact', step: 'start', to });
    
    // Create draft
    const draft = await createContactDraft(pool, { 
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
    logger.error('startContactFlow failed', { err: err.message });
    await sendWhatsAppText({
      to,
      text: 'Ocurrió un error. Intenta de nuevo.',
      token,
      phoneNumberId
    });
  }
}

// === Handle contact text input ===
export async function handleContactText({ to, text, pool, token, phoneNumberId }) {
  try {
    const draft = await getContactDraft(pool, to);
    if (!draft) return false;
    
    const step = draft.step || '';
    logger.info({ svc: 'contact', step, text: normalizeUserText(text) });
    
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
      
      await updateContactDraft(pool, draft.id, { 
        customer_name: name,
        step: 'awaiting_department'
      });
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${name}\n¿Con qué área deseas contactarte?`,
        token,
        phoneNumberId
      });
      
      // Show department options (max 3 buttons per WhatsApp limitation)
      await sendInteractiveButtons({
        to,
        body: "Selecciona el área:",
        buttons: [
          { id: 'contact_dept_facturacion', title: 'Facturación' },
          { id: 'contact_dept_gerencia', title: 'Gerencia' },
          { id: 'contact_dept_servicio', title: 'Servicio al cliente' }
        ],
        token,
        phoneNumberId
      });
      
      // Note: Due to WhatsApp 3-button limit, we'll need to show remaining options separately
      // For now, showing first 3 options
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleContactText failed', { err: err.message });
    return false;
  }
}

// === Handle contact buttons ===
export async function handleContactButtons({ to, id, pool, token, phoneNumberId }) {
  try {
    const draft = await getContactDraft(pool, to);
    if (!draft) return false;
    
    logger.info({ svc: 'contact', button: id });
    
    // Show more departments
    if (id === 'contact_show_more_depts') {
      await sendInteractiveButtons({
        to,
        body: "Más áreas:",
        buttons: [
          { id: 'contact_dept_seguridad', title: 'Seguridad y estacionamiento' },
          { id: 'contact_dept_tienda', title: 'Tienda' }
        ],
        token,
        phoneNumberId
      });
      return true;
    }
    
    // Department selections
    if (id === 'contact_dept_facturacion') {
      await updateContactDraft(pool, draft.id, {
        department: 'Facturación',
        step: 'completed'
      });
      
      await sendWhatsAppText({
        to,
        text: `El número de *Facturación* es:\n\n📞 ${CONTACT_NUMBERS.facturacion}\n\n¡Con gusto te atenderán!`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'contact_dept_gerencia') {
      await updateContactDraft(pool, draft.id, {
        department: 'Gerencia',
        step: 'completed'
      });
      
      await sendWhatsAppText({
        to,
        text: `El número de *Gerencia* es:\n\n📞 ${CONTACT_NUMBERS.gerencia}\n\n¡Con gusto te atenderán!`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'contact_dept_servicio') {
      await updateContactDraft(pool, draft.id, {
        department: 'Servicio al Cliente',
        step: 'completed'
      });
      
      await sendWhatsAppText({
        to,
        text: `El número de *Servicio al Cliente* es:\n\n📞 ${CONTACT_NUMBERS.servicio_cliente}\n\n¡Con gusto te atenderán!`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'contact_dept_seguridad') {
      await updateContactDraft(pool, draft.id, {
        department: 'Seguridad y Estacionamiento',
        step: 'completed'
      });
      
      await sendWhatsAppText({
        to,
        text: `El número de *Seguridad y Estacionamiento* es:\n\n📞 ${CONTACT_NUMBERS.seguridad}\n\n¡Con gusto te atenderán!`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'contact_dept_tienda') {
      await updateContactDraft(pool, draft.id, {
        department: 'Tienda',
        step: 'completed'
      });
      
      await sendWhatsAppText({
        to,
        text: `El número de *Tienda* es:\n\n📞 ${CONTACT_NUMBERS.tienda}\n\n¡Con gusto te atenderán!`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleContactButtons failed', { err: err.message });
    return false;
  }
}
