// wine_events.flow.js - Wine tasting and harvest events flow
import { logger } from "./config.js";
import { 
  sendWhatsAppText, 
  sendInteractiveButtons,
  delay
} from "./wa.js";
import { 
  createWineEventDraft,
  getWineEventDraft,
  updateWineEventDraft,
  listAvailableWineEvents,
  getWineEventById,
  confirmWineEventReservation
} from "./db.js";
import { normalizeUserText, isValidEmail, formatMoneyMXN } from "./price.js";

// === Start wine events flow ===
export async function startWineEventsFlow({ to, token, phoneNumberId, pool }) {
  try {
    logger.info({ svc: 'wine_events', step: 'start', to });
    
    // Create draft
    const draft = await createWineEventDraft(pool, { 
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
    logger.error('startWineEventsFlow failed', { err: err.message });
    await sendWhatsAppText({
      to,
      text: 'Ocurrió un error. Intenta de nuevo.',
      token,
      phoneNumberId
    });
  }
}

// === Handle wine events text input ===
export async function handleWineEventsText({ to, text, pool, token, phoneNumberId }) {
  try {
    const draft = await getWineEventDraft(pool, to);
    if (!draft) return false;
    
    const step = draft.step || '';
    logger.info({ svc: 'wine_events', step, text: normalizeUserText(text) });
    
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
      
      await updateWineEventDraft(pool, draft.id, { 
        customer_name: name,
        step: 'showing_events'
      });
      
      // Show available events
      const events = await listAvailableWineEvents(pool);
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${name},\n\nLos próximos eventos que tenemos programados son:`,
        token,
        phoneNumberId
      });
      
      await delay(600);
      
      // Display events
      for (let i = 0; i < events.length; i++) {
        const evt = events[i];
        const emoji = i === 0 ? '1️⃣' : i === 1 ? '2️⃣' : i === 2 ? '3️⃣' : '4️⃣';
        await sendWhatsAppText({
          to,
          text: `${emoji} *${evt.name}*\n${evt.description || ''}\n*Fecha:* ${evt.event_date}\n*Precio por persona:* ${formatMoneyMXN(evt.price_per_person)}`,
          token,
          phoneNumberId
        });
        await delay(500);
      }
      
      await delay(400);
      
      // Show event selection buttons (max 3)
      const buttons = events.slice(0, 3).map((evt, i) => ({
        id: `wine_event_select_${evt.id}`,
        title: evt.name.substring(0, 20)
      }));
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona el evento:",
        buttons,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    // Step: awaiting_party_size
    if (step === 'awaiting_party_size') {
      const digits = String(text || '').match(/\d+/);
      const n = digits ? Number(digits[0]) : NaN;
      
      if (!Number.isInteger(n) || n < 1) {
        await sendWhatsAppText({
          to,
          text: "Por favor, indica un número válido de personas (mínimo 1).",
          token,
          phoneNumberId
        });
        return true;
      }
      
      // Get event to calculate total
      const event = await getWineEventById(pool, draft.event_id);
      if (!event) {
        await sendWhatsAppText({
          to,
          text: "Error al obtener el evento. Intenta de nuevo.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      const total = event.price_per_person * n;
      
      await updateWineEventDraft(pool, draft.id, { 
        party_size: n,
        total_amount: total,
        step: 'awaiting_payment_method'
      });
      
      await sendWhatsAppText({
        to,
        text: `El monto total a pagar es: *${formatMoneyMXN(total)}*\n\n¿Cómo deseas pagar?`,
        token,
        phoneNumberId
      });
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona método de pago:",
        buttons: [
          { id: 'wine_event_pay_online', title: 'Pagar en línea' },
          { id: 'wine_event_pay_transfer', title: 'Transferencia' }
        ],
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    // Step: awaiting_email
    if (step === 'awaiting_email') {
      const email = normalizeUserText(text);
      if (!isValidEmail(email)) {
        await sendWhatsAppText({
          to,
          text: "Correo inválido. Por favor, escribe un email válido (ejemplo: usuario@dominio.com):",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateWineEventDraft(pool, draft.id, { 
        email,
        step: 'completed'
      });
      
      // Confirm reservation
      await confirmWineEventReservation(pool, draft.id);
      
      const event = await getWineEventById(pool, draft.event_id);
      
      const summary = 
        `✅ *RESUMEN DE RESERVACIÓN*\n\n` +
        `*Cliente:* ${draft.customer_name}\n` +
        `*Evento:* ${event?.name || 'N/A'}\n` +
        `*Fecha:* ${event?.event_date || 'N/A'}\n` +
        `*Personas:* ${draft.party_size}\n` +
        `*Total:* ${formatMoneyMXN(draft.total_amount)}\n` +
        `*Método de pago:* ${draft.payment_method}\n` +
        `*Email:* ${email}\n\n` +
        `*¿Cómo llegar?*\n` +
        `https://maps.app.goo.gl/NYNzXRZksqTfhh83A\n\n` +
        `Hemos enviado un email, confírmanos y tu lugar está garantizado. 🍷`;
      
      await sendWhatsAppText({
        to,
        text: summary,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleWineEventsText failed', { err: err.message });
    return false;
  }
}

// === Handle wine events buttons ===
export async function handleWineEventsButtons({ to, id, pool, token, phoneNumberId }) {
  try {
    const draft = await getWineEventDraft(pool, to);
    if (!draft) return false;
    
    logger.info({ svc: 'wine_events', button: id });
    
    // Event selection
    if (id.startsWith('wine_event_select_')) {
      const eventId = parseInt(id.replace('wine_event_select_', ''));
      const event = await getWineEventById(pool, eventId);
      
      if (!event) {
        await sendWhatsAppText({
          to,
          text: 'Evento no encontrado.',
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateWineEventDraft(pool, draft.id, {
        event_id: eventId,
        step: 'awaiting_party_size'
      });
      
      await sendWhatsAppText({
        to,
        text: `Has seleccionado: *${event.name}*\n\n¿Para cuántas personas deseas reservar?`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    // Payment method selection
    if (id === 'wine_event_pay_online') {
      await updateWineEventDraft(pool, draft.id, {
        payment_method: 'Pago en línea',
        step: 'awaiting_email'
      });
      
      await sendWhatsAppText({
        to,
        text: "Has seleccionado: *Pago en línea*\n\nCompártenos un correo para enviarte la liga de confirmación:",
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'wine_event_pay_transfer') {
      await updateWineEventDraft(pool, draft.id, {
        payment_method: 'Transferencia',
        step: 'awaiting_email'
      });
      
      await sendWhatsAppText({
        to,
        text: "Has seleccionado: *Transferencia*\n\nCompártenos un correo para enviarte la liga de confirmación:",
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleWineEventsButtons failed', { err: err.message });
    return false;
  }
}
