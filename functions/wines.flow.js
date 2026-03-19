import { logger } from "./config.js";
import { 
  sendWhatsAppText, 
  sendInteractiveButtons,
  sendImageWithCaption,
  delay
} from "./wa.js";
import { 
  createWineDraft,
  getWineDraft,
  updateWineDraft,
  listAvailableWines,
  getWineById,
  confirmWinePurchase,
  cancelWineDraft,
  getCustomerProfileByPhone,
  saveCustomerProfile,
  clearAllEnolobotDrafts,
  logConversation
} from "./db.js";
import { normalizeUserText, isValidEmail } from "./price.js";
import { buildImageUrlFromConfig } from "./hotelconfig.js";
import { sendChatbotEmailPayload } from "./email.js";

const WINE_STATES = new Set(['awaiting_name', 'showing_wines', 'wine_selected', 'awaiting_email']);

export async function startWineFlow({ to, token, phoneNumberId, pool }) {
  try {
    logger.info({ svc: 'wines', step: 'start', to });
    
    await clearAllEnolobotDrafts(pool, to);
    
    // Registrar inicio de flujo
    await logConversation(pool, {
      phone: to,
      messageType: 'other',
      content: 'Inicio de flujo de vinos',
      direction: 'outbound'
    });
    
    const profile = await getCustomerProfileByPhone(pool, to);
    
    if (profile && profile.customer_name) {
      logger.info({ svc: 'wines', step: 'using_saved_name', name: profile.customer_name });
      
      const draft = await createWineDraft(pool, { phone: to, step: 'showing_wines' });
      await updateWineDraft(pool, draft.id, { customer_name: profile.customer_name });
      
      const wines = await listAvailableWines(pool);
      
      logger.info({ 
        svc: 'wines', 
        action: 'wines_retrieved', 
        count: wines?.length || 0
      });
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${profile.customer_name}, este es el portafolio de vinos que tenemos:`,
        token,
        phoneNumberId
      });
      
      if (!wines || wines.length === 0) {
        await sendWhatsAppText({
          to,
          text: "En este momento no tengo vinos disponibles para mostrarte.",
          token,
          phoneNumberId
        });
        return true;
      }

      await delay(800);
      
      for (const wine of wines) {
        const caption = `*${wine.name}*\n\n${wine.description || ''}\n\n*Precio:* $${wine.price} MXN`;
        const imageUrl = buildImageUrlFromConfig(wine.image_path);
        
        if (imageUrl) {
          try {
            await sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId });
          } catch (imgErr) {
            logger.error({ svc: 'wines', error: imgErr.message });
            await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
          }
        } else {
          await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
        }
        await delay(600);
      }
      
      await delay(400);
      await sendWhatsAppText({
        to,
        text: "¿Ya los conoces o deseas que te comparta detalles de cada uno?",
        token,
        phoneNumberId
      });
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona una opción:",
        buttons: [
          { id: 'wine_skip_details', title: 'Sí, ya los conozco' },
          { id: 'wine_show_details', title: 'No, dame detalles' }
        ],
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    const draft = await createWineDraft(pool, { phone: to, step: 'awaiting_name' });
    
    await sendWhatsAppText({
      to,
      text: "¿Con quién tengo el gusto (Nombre y apellido)?",
      token,
      phoneNumberId
    });
    
    return true;
  } catch (err) {
    logger.error('startWineFlow failed', { err: err.message });
    await sendWhatsAppText({
      to,
      text: 'Ocurrió un error. Intenta de nuevo.',
      token,
      phoneNumberId
    });
  }
}

export async function handleWineText({ to, text, pool, token, phoneNumberId }) {
  try {
    const draft = await getWineDraft(pool, to);
    
    // Registrar mensaje de texto
    await logConversation(pool, {
      phone: to,
      messageType: 'text',
      content: text,
      direction: 'inbound',
      draftId: draft?.id
    });
    
    if (!draft) return false;
    
    const step = draft.step || '';
    logger.info({ svc: 'wines', step, text: normalizeUserText(text) });
    
    if (step === 'awaiting_name') {
      const name = normalizeUserText(text);
      if (!name || name.length < 3) {
        await logConversation(pool, {
          phone: to,
          messageType: 'other',
          content: 'Nombre inválido: ' + name,
          direction: 'outbound',
          draftId: draft.id
        });
        
        await sendWhatsAppText({
          to,
          text: "Por favor, escribe tu nombre completo.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await saveCustomerProfile(pool, to, name);
      await updateWineDraft(pool, draft.id, { 
        customer_name: name,
        step: 'showing_wines'
      });
      
      await logConversation(pool, {
        phone: to,
        messageType: 'other',
        content: `Nombre guardado: ${name}`,
        direction: 'outbound',
        draftId: draft.id
      });
      
      const wines = await listAvailableWines(pool);
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${name}, este es el portafolio de vinos que tenemos:`,
        token,
        phoneNumberId
      });
      
      if (!wines || wines.length === 0) {
        await sendWhatsAppText({
          to,
          text: "No hay vinos disponibles en este momento.",
          token,
          phoneNumberId
        });
        return true;
      }

      await delay(800);
      
      for (const wine of wines) {
        const caption = `*${wine.name}*\n\n${wine.description || ''}\n\n*Precio:* $${wine.price} MXN`;
        const imageUrl = buildImageUrlFromConfig(wine.image_path);
        
        if (imageUrl) {
          try {
            await sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId });
          } catch (imgErr) {
            await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
          }
        } else {
          await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
        }
        await delay(600);
      }
      
      await delay(400);
      await sendWhatsAppText({
        to,
        text: "¿Ya los conoces o deseas que te comparta detalles de cada uno?",
        token,
        phoneNumberId
      });
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona una opción:",
        buttons: [
          { id: 'wine_skip_details', title: 'Sí, ya los conozco' },
          { id: 'wine_show_details', title: 'No, dame detalles' }
        ],
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (step === 'awaiting_email') {
      const email = normalizeUserText(text);
      if (!isValidEmail(email)) {
        await logConversation(pool, {
          phone: to,
          messageType: 'other',
          content: 'Email inválido: ' + email,
          direction: 'outbound',
          draftId: draft.id,
          wineId: draft.wine_id
        });
        
        await sendWhatsAppText({
          to,
          text: "Correo inválido. Por favor, escribe un email válido:",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateWineDraft(pool, draft.id, { 
        email,
        step: 'completed'
      });
      
      await confirmWinePurchase(pool, draft.id);
      
      const wine = await getWineById(pool, draft.wine_id);
      const total = wine ? wine.price * (draft.quantity || 1) : 0;

      await logConversation(pool, {
        phone: to,
        messageType: 'other',
        content: `Compra completada: ${wine?.name} - $${total}`,
        direction: 'outbound',
        draftId: draft.id,
        wineId: draft.wine_id
      });

      await sendChatbotEmailPayload({
        correoDestinatario: email,
        mensajeUsuario: `Compra confirmada. Cliente: ${draft.customer_name}. Vino: ${wine?.name || 'N/A'}. Total: $${total} MXN.`,
        idChat: to,
      });
      
      await sendWhatsAppText({
        to,
        text: `✅ *CONFIRMACIÓN DE COMPRA*\n\n*Cliente:* ${draft.customer_name}\n*Vino:* ${wine?.name || 'N/A'}\n*Total:* $${total} MXN\n\nEnviamos un email a ${email}.\n\n¡Gracias! 🍷`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleWineText failed', { err: err.message });
    return false;
  }
}

export async function handleWineButtons({ to, id, pool, token, phoneNumberId }) {
  try {
    const draft = await getWineDraft(pool, to);
    
    // Registrar click en botón
    await logConversation(pool, {
      phone: to,
      messageType: 'button',
      content: id,
      direction: 'inbound',
      draftId: draft?.id
    });
    
    if (!draft) return false;
    
    logger.info({ svc: 'wines', button: id });
    
    if (id === 'wine_show_details') {
      const wines = await listAvailableWines(pool);

      if (!wines || wines.length === 0) {
        await sendWhatsAppText({
          to,
          text: "No encuentro vinos disponibles.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await sendWhatsAppText({
        to,
        text: "*DETALLES DE NUESTROS VINOS:*",
        token,
        phoneNumberId
      });
      
      await delay(600);
      
      for (const wine of wines) {
        await sendWhatsAppText({
          to,
          text: `🍷 *${wine.name}*\n${wine.description || 'Sin descripción'}\n\n💰 $${wine.price} MXN`,
          token,
          phoneNumberId
        });
        await delay(500);
      }
      
      await delay(400);
      await sendWhatsAppText({
        to,
        text: "¿Cuál vino elegirás?",
        token,
        phoneNumberId
      });
      
      const buttons = wines.slice(0, 3).map(w => ({
        id: `wine_select_${w.id}`,
        title: w.name.substring(0, 20)
      }));
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona tu vino:",
        buttons,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'wine_skip_details') {
      const wines = await listAvailableWines(pool);

      if (!wines || wines.length === 0) {
        await sendWhatsAppText({
          to,
          text: "No encuentro vinos disponibles.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await sendWhatsAppText({
        to,
        text: "Perfecto, ¿cuál vino elegirás?",
        token,
        phoneNumberId
      });
      
      const buttons = wines.slice(0, 3).map(w => ({
        id: `wine_select_${w.id}`,
        title: w.name.substring(0, 20)
      }));
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona un vino:",
        buttons,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id.startsWith('wine_select_')) {
      const wineId = parseInt(id.replace('wine_select_', ''));
      const wine = await getWineById(pool, wineId);
      
      if (!wine) {
        await sendWhatsAppText({
          to,
          text: 'Vino no encontrado.',
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateWineDraft(pool, draft.id, {
        wine_id: wineId,
        quantity: 1,
        step: 'awaiting_email'
      });
      
      await logConversation(pool, {
        phone: to,
        messageType: 'other',
        content: `Vino seleccionado: ${wine.name}`,
        direction: 'outbound',
        draftId: draft.id,
        wineId: wineId
      });
      
      await sendWhatsAppText({
        to,
        text: `Has seleccionado: *${wine.name}*\n\nCompártenos un correo para enviarte la confirmación:`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleWineButtons failed', { err: err.message });
    return false;
  }
}