// guest.flow.js - Flow for non-registered users (guest menu)
import { logger } from "./config.js";
import { sendWhatsAppText, sendInteractiveList } from "./wa.js";

/**
 * Shows menu for non-registered users with 4 options:
 * 1. Registrarse
 * 2. Reservar Habitación (blocked)
 * 3. Reservar Amenidad (blocked)
 * 4. Reservar Mesa (blocked)
 */
export async function showGuestMenu(ctx) {
  const { to, token, phoneNumberId } = ctx;
  
  logger.info({ flow: 'guest', action: 'showGuestMenu', to });
  
  const menuRows = [
    { id: "register:start", title: "Registrarse" },
    { id: "guest:block-room", title: "Reservar Habitación" },
    { id: "guest:block-amenity", title: "Reservar Amenidad" },
    { id: "guest:block-table", title: "Reservar Mesa" }
  ];
  
  await sendInteractiveList({
    to,
    header: "Bienvenido",
    body: "Selecciona una opción para continuar:",
    footer: "Primero necesitas registrarte",
    buttonText: "Elegir",
    rows: menuRows,
    token,
    phoneNumberId
  });
}

/**
 * Handles guest menu postback actions
 */
export async function handleGuestPostback(ctx, payload) {
  const { to, token, phoneNumberId, pool } = ctx;
  
  logger.info({ flow: 'guest', action: 'handleGuestPostback', payload, to });
  
  if (payload === "guest:block-room") {
    // 1️⃣ Mensaje informativo
    await sendWhatsAppText({
      to,
      text: "Para reservar una habitación debes registrarte primero",
      token,
      phoneNumberId
    });

    // 2️⃣ Botón único "Registrarte" (sin mostrar el menú "Elegir")
    const { sendInteractiveButtons } = await import('./wa.js');
    await sendInteractiveButtons({
      to,
      body: "Comienza tu registro usando el botón de abajo para comenzar",
      buttons: [{ id: "register:start", title: "📝 Registrate" }],
      token,
      phoneNumberId
    });

    // 3️⃣ No volver a mostrar el menú
    return true;
  }
  
  if (payload === "guest:block-amenity") {
    // No longer blocked - redirect to guest amenity flow
    const { showGuestAmenitiesMenu } = await import('./guest_amenities.flow.js');
    await showGuestAmenitiesMenu({ to, token, phoneNumberId, pool, from: to });
    return true;
  }
  
  if (payload === "guest:block-table") {
    // No longer blocked - redirect to guest table flow
    const { startGuestTableFlow } = await import('./guest_tables.flow.js');
    await startGuestTableFlow({ to, token, phoneNumberId, pool, from: to });
    return true;
  }
  
  return false;
}