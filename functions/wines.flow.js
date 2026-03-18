// wines.flow.js - Wine purchase flow
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
  clearAllEnolobotDrafts
} from "./db.js";
import { normalizeUserText, isValidEmail } from "./price.js";
import { buildImageUrlFromConfig } from "./hotelconfig.js";
import { sendChatbotEmailPayload } from "./email.js";

const WINE_STATES = new Set(['awaiting_name', 'showing_wines', 'wine_selected', 'awaiting_email']);

// === Start wine purchase flow ===
export async function startWineFlow({ to, token, phoneNumberId, pool }) {
  try {
    logger.info({ svc: 'wines', step: 'start', to });
    
    // Clear all other Enolobot drafts to avoid conflicts
    await clearAllEnolobotDrafts(pool, to);
    
    // Check if customer profile already exists
    const profile = await getCustomerProfileByPhone(pool, to);
    
    if (profile && profile.customer_name) {
      // Customer name already exists, skip to wine catalog
      logger.info({ svc: 'wines', step: 'using_saved_name', name: profile.customer_name });
      
      const draft = await createWineDraft(pool, { phone: to, step: 'showing_wines' });
      await updateWineDraft(pool, draft.id, { customer_name: profile.customer_name });
      
      // Show wine catalog
      const wines = await listAvailableWines(pool);
      
      logger.info({ 
        svc: 'wines', 
        action: 'wines_retrieved', 
        count: wines?.length || 0,
        wineData: wines?.map(w => ({ 
          id: w.id, 
          name: w.name, 
          image_path: w.image_path,
          price: w.price 
        })) 
      });
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${profile.customer_name}, este es el portafolio de vinos que tenemos:`,
        token,
        phoneNumberId
      });
      
      if (!wines || wines.length === 0) {
        logger.warn({ svc: 'wines', warn: 'no_wines_available' });
        await sendWhatsAppText({
          to,
          text: "En este momento no tengo vinos disponibles para mostrarte. Si gustas, te puedo comunicar con administración para apoyarte.",
          token,
          phoneNumberId
        });
        return true;
      }

      await delay(800);
      
      // Send each wine with image
      for (const wine of wines) {
        const caption = `*${wine.name}*\n\n${wine.description || ''}\n\n*Precio:* $${wine.price} MXN`;
        const imageUrl = buildImageUrlFromConfig(wine.image_path);
        
        logger.info({ 
          svc: 'wines', 
          action: 'preparing_wine_message', 
          wine_id: wine.id,
          wine_name: wine.name, 
          image_path_from_db: wine.image_path,
          imageUrl_constructed: imageUrl,
          has_image_path: !!wine.image_path,
          has_imageUrl: !!imageUrl
        });
        
        let imageSent = false;
        
        if (imageUrl) {
          try {
            logger.info({ svc: 'wines', action: 'sending_image', wine_name: wine.name, url: imageUrl });
            await sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId });
            logger.info({ svc: 'wines', action: 'image_sent_success', wine_name: wine.name });
            imageSent = true;
          } catch (imgErr) {
            logger.error({ 
              svc: 'wines', 
              action: 'image_send_failed', 
              wine_name: wine.name, 
              imageUrl, 
              error: imgErr.message,
              errorStack: imgErr.stack,
              errorResponse: imgErr?.response?.data 
            });
            // Si falla la imagen, enviar solo texto
            try {
              await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
              logger.info({ svc: 'wines', action: 'fallback_text_sent_after_image_fail', wine_name: wine.name });
            } catch (textErr) {
              logger.error({ 
                svc: 'wines', 
                action: 'fallback_text_also_failed', 
                wine_name: wine.name,
                error: textErr.message
              });
            }
          }
        } else {
          logger.warn({ svc: 'wines', action: 'no_image_url', wine_name: wine.name, image_path: wine.image_path });
          // No hay imagen, enviar solo texto
          try {
            await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
            logger.info({ svc: 'wines', action: 'text_only_sent', wine_name: wine.name });
          } catch (textErr) {
            logger.error({ 
              svc: 'wines', 
              action: 'text_only_failed', 
              wine_name: wine.name,
              error: textErr.message
            });
          }
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
    
    // No saved name, ask for it
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

// === Handle wine text input ===
export async function handleWineText({ to, text, pool, token, phoneNumberId }) {
  try {
    const draft = await getWineDraft(pool, to);
    if (!draft) return false;
    
    const step = draft.step || '';
    logger.info({ svc: 'wines', step, text: normalizeUserText(text) });
    
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
      
      // Save customer name for future interactions
      await saveCustomerProfile(pool, to, name);
      
      await updateWineDraft(pool, draft.id, { 
        customer_name: name,
        step: 'showing_wines'
      });
      
      // Show wine catalog
      const wines = await listAvailableWines(pool);
      
      logger.info({ 
        svc: 'wines', 
        action: 'wines_retrieved_new_customer', 
        count: wines?.length || 0,
        wineData: wines?.map(w => ({ 
          id: w.id, 
          name: w.name, 
          image_path: w.image_path,
          price: w.price 
        })) 
      });
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${name}, este es el portafolio de vinos que tenemos:`,
        token,
        phoneNumberId
      });
      
      if (!wines || wines.length === 0) {
        logger.warn({ svc: 'wines', warn: 'no_wines_available_new_customer' });
        await sendWhatsAppText({
          to,
          text: "En este momento no tengo vinos disponibles para mostrarte. Si gustas, te puedo comunicar con administración para apoyarte.",
          token,
          phoneNumberId
        });
        return true;
      }

      await delay(800);
      
      // Send each wine with image
      for (const wine of wines) {
        const caption = `*${wine.name}*\n\n${wine.description || ''}\n\n*Precio:* $${wine.price} MXN`;
        const imageUrl = buildImageUrlFromConfig(wine.image_path);
        
        logger.info({ 
          svc: 'wines', 
          action: 'preparing_wine_message_new_customer', 
          wine_id: wine.id,
          wine_name: wine.name, 
          image_path_from_db: wine.image_path,
          imageUrl_constructed: imageUrl,
          has_image_path: !!wine.image_path,
          has_imageUrl: !!imageUrl
        });
        
        let imageSent = false;
        
        if (imageUrl) {
          try {
            logger.info({ svc: 'wines', action: 'sending_image_new_customer', wine_name: wine.name, url: imageUrl });
            await sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId });
            logger.info({ svc: 'wines', action: 'image_sent_success_new_customer', wine_name: wine.name });
            imageSent = true;
          } catch (imgErr) {
            logger.error({ 
              svc: 'wines', 
              action: 'image_send_failed_new_customer', 
              wine_name: wine.name, 
              imageUrl, 
              error: imgErr.message,
              errorStack: imgErr.stack,
              errorResponse: imgErr?.response?.data 
            });
            // Si falla la imagen, enviar solo texto
            try {
              await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
              logger.info({ svc: 'wines', action: 'fallback_text_sent_after_image_fail_new_customer', wine_name: wine.name });
            } catch (textErr) {
              logger.error({ 
                svc: 'wines', 
                action: 'fallback_text_also_failed_new_customer', 
                wine_name: wine.name,
                error: textErr.message
              });
            }
          }
        } else {
          logger.warn({ svc: 'wines', action: 'no_image_url_new_customer', wine_name: wine.name, image_path: wine.image_path });
          // No hay imagen, enviar solo texto
          try {
            await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
            logger.info({ svc: 'wines', action: 'text_only_sent_new_customer', wine_name: wine.name });
          } catch (textErr) {
            logger.error({ 
              svc: 'wines', 
              action: 'text_only_failed_new_customer', 
              wine_name: wine.name,
              error: textErr.message
            });
          }
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
      
      await updateWineDraft(pool, draft.id, { 
        email,
        step: 'completed'
      });
      
      // Confirm purchase
      await confirmWinePurchase(pool, draft.id);
      
      const wine = await getWineById(pool, draft.wine_id);
      const total = wine ? wine.price * (draft.quantity || 1) : 0;

      await sendChatbotEmailPayload({
        correoDestinatario: email,
        mensajeUsuario: `Compra confirmada. Cliente: ${draft.customer_name}. Vino: ${wine?.name || 'N/A'}. Cantidad: ${draft.quantity || 1}. Total: $${total} MXN.`,
        idChat: to,
      });
      
      await sendWhatsAppText({
        to,
        text: `✅ *CONFIRMACIÓN DE COMPRA*\n\n*Cliente:* ${draft.customer_name}\n*Vino:* ${wine?.name || 'N/A'}\n*Cantidad:* ${draft.quantity || 1}\n*Total:* $${total} MXN\n\nHemos enviado un email a ${email} con los detalles de tu compra.\n\n¡Gracias por tu compra! 🍷`,
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

// === Handle wine buttons ===
export async function handleWineButtons({ to, id, pool, token, phoneNumberId }) {
  try {
    const draft = await getWineDraft(pool, to);
    if (!draft) return false;
    
    logger.info({ svc: 'wines', button: id });
    
    // Show details button
    if (id === 'wine_show_details') {
      const wines = await listAvailableWines(pool);

      if (!wines || wines.length === 0) {
        await sendWhatsAppText({
          to,
          text: "No encuentro vinos disponibles en este momento.",
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
        const details = wine.details || `Sugerido para: ${wine.suggested_for || 'cualquier ocasión'}`;
        await sendWhatsAppText({
          to,
          text: `🍷 *${wine.name}*\n${details}`,
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
      
      // Show wine selection buttons
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
    
    // Skip details button - go directly to selection
    if (id === 'wine_skip_details') {
      const wines = await listAvailableWines(pool);

      if (!wines || wines.length === 0) {
        await sendWhatsAppText({
          to,
          text: "No encuentro vinos disponibles en este momento.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await sendWhatsAppText({
        to,
        text: "¿Cuál vino elegirás?",
        token,
        phoneNumberId
      });
      
      // Show wine selection buttons
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
    
    // Wine selection
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
