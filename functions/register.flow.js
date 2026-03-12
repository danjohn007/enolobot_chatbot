// register.flow.js - User registration wizard flow
import { logger } from "./config.js";
import { 
  upsertDraft, 
  getDraft, 
  clearDraft,
  insertGuestUser,
  getUserByPhone,
  normalizePhoneMX
} from "./db.js";
import { sendWhatsAppText, sendInteractiveButtons } from "./wa.js";
import { showGuestMenu } from "./guest.flow.js";

// In-memory storage for registration state (for users without IDs yet)
// Key: phone number, Value: registration state
const registrationStates = new Map();

// TTL for registration states (30 minutes)
const REGISTRATION_TTL_MS = 30 * 60 * 1000;

/**
 * Cleans up expired registration states
 */
function cleanupExpiredStates() {
  const now = Date.now();
  for (const [phone, state] of registrationStates.entries()) {
    if (now - state.timestamp > REGISTRATION_TTL_MS) {
      registrationStates.delete(phone);
      logger.info({ flow: 'register', action: 'cleanup_expired', phone });
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredStates, 5 * 60 * 1000);

/**
 * Checks if a phone number is in active registration flow
 */
export async function isInRegistrationFlow(phone) {
  const state = registrationStates.get(phone);
  if (!state) return false;
  
  // Check if not expired
  if (Date.now() - state.timestamp > REGISTRATION_TTL_MS) {
    registrationStates.delete(phone);
    return false;
  }
  
  return true;
}

/**
 * Validates name/lastname: 2-60 chars, letters and spaces (tolerant to accents)
 */
function isValidName(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  // Allow letters (including accented), spaces, and apostrophes
  return /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s']+$/.test(trimmed);
}

/**
 * Normalizes name by removing extra spaces
 */
function normalizeName(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Splits full name into first and last name (takes first two words only)
 */
function splitNameLast(input) {
  const clean = normalizeName(input);
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length < 2) return { error: 'need_two_words' };
  // Take exactly the first and the second word, ignore the rest
  const first = parts[0];
  const last = parts[1];
  return { first, last };
}

/**
 * Validates email format
 */
function isValidEmail(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Gets current registration state (from memory for non-users, from draft for users)
 */
async function getRegistrationState(pool, phone, userId) {
  if (userId) {
    // Try to get from user_drafts
    const draft = await getDraft(pool, userId);
    if (draft && draft.svc === 'register') {
      try {
        return JSON.parse(draft.draft || '{}');
      } catch {
        return null;
      }
    }
    return null;
  } else {
    // Get from in-memory storage
    const state = registrationStates.get(phone);
    if (state && Date.now() - state.timestamp < REGISTRATION_TTL_MS) {
      return state.data;
    }
    return null;
  }
}

/**
 * Updates registration state
 */
async function updateRegistrationState(pool, phone, userId, hotelId, data) {
  const state = {
    kind: 'register',
    ...data,
    timestamp: Date.now()
  };
  
  if (userId) {
    // Store in user_drafts
    await upsertDraft(pool, userId, {
      svc: 'register',
      step: data.step || null,
      waiting: data.waiting || null,
      hotelId: hotelId,
      draft: JSON.stringify(state)
    });
  } else {
    // Store in memory
    registrationStates.set(phone, {
      data: state,
      timestamp: Date.now()
    });
  }
}

/**
 * Clears registration state
 */
async function clearRegistrationState(pool, phone, userId) {
  if (userId) {
    await clearDraft(pool, userId);
  } else {
    registrationStates.delete(phone);
  }
}

/**
 * Starts registration flow
 * Creates draft with kind='register' and asks for full_name
 */
export async function startRegistration(ctx) {
  const { to, token, phoneNumberId, pool, from, user } = ctx;
  
  logger.info({ flow: 'register', action: 'startRegistration', to, hasUser: !!user });
  
  const hotelId = 6; // Default hotel_id
  
  // Normalize phone from the start
  const normPhone = normalizePhoneMX(from);
  
  const state = {
    step: 'ask_full_name',
    phone: normPhone,
    first_name: null,
    last_name: null,
    email: null
  };
  
  await updateRegistrationState(pool, from, user?.id, hotelId, state);
  
  await sendWhatsAppText({
    to,
    text: "Muy bien comencemos con el registro. Escribe tu *Nombre y Apellido*. Ej.: \"Ana López\"",
    token,
    phoneNumberId
  });
}

/**
 * Handles text input or postback during registration
 */
export async function handleRegistrationInput(ctx, textOrPostback) {
  const { to, token, phoneNumberId, pool, from, user } = ctx;
  
  logger.info({ flow: 'register', action: 'handleRegistrationInput', input: textOrPostback, to });
  
  // Get current state
  const state = await getRegistrationState(pool, from, user?.id);
  
  if (!state) {
    // No state found - user may have timed out
    await sendWhatsAppText({
      to,
      text: "Tu sesión expiró. Escribe *hola* para comenzar de nuevo.",
      token,
      phoneNumberId
    });
    return;
  }
  
  const hotelId = 6;
  
  // Handle based on current step
  if (state.step === 'ask_full_name') {
    // Validate and split full name
    const { first, last, error } = splitNameLast(textOrPostback);
    if (error) {
      await sendWhatsAppText({
        to,
        text: "Por favor escribe *Nombre y Apellido*. Ej.: \"Ana López\"",
        token,
        phoneNumberId
      });
      return;
    }
    
    if (!isValidName(first) || !isValidName(last)) {
      await sendWhatsAppText({
        to,
        text: "Usa solo letras y espacios. Ej.: \"Ana López\"",
        token,
        phoneNumberId
      });
      return;
    }
    
    // Save both names and move to email
    state.first_name = first;
    state.last_name = last;
    state.step = 'ask_email';
    
    await updateRegistrationState(pool, from, user?.id, hotelId, state);
    
    await sendWhatsAppText({
      to,
      text: "Perfecto. Ahora escribe tu *correo electrónico* (ej.: nombre@correo.com).",
      token,
      phoneNumberId
    });
    return;
  }
  
  if (state.step === 'ask_email') {
    // Validate email
    if (!isValidEmail(textOrPostback)) {
      await sendWhatsAppText({
        to,
        text: "Ese correo no parece válido. Intenta con un formato *nombre@dominio.com*.",
        token,
        phoneNumberId
      });
      return;
    }
    
    // Save email and move to confirmation
    state.email = textOrPostback.trim().toLowerCase();
    state.step = 'confirm';
    
    await updateRegistrationState(pool, from, user?.id, hotelId, state);
    
    // Show confirmation
    const confirmText = 
      `Confirma tus datos:\n` +
      `• Nombre: ${state.first_name}\n` +
      `• Apellido: ${state.last_name}\n` +
      `• Email: ${state.email}\n` +
      `• Teléfono: ${state.phone}\n\n` +
      `¿Son correctos tus datos?`;
    
    await sendWhatsAppText({
      to,
      text: confirmText,
      token,
      phoneNumberId
    });
    
    // Show main action buttons (max 3)
    await sendInteractiveButtons({
      to,
      body: "Usa los botones para seleccionar:",
      buttons: [
        { id: 'register:confirm', title: 'Confirmar' },
        { id: 'register:edit:full_name', title: 'Editar datos' },
        { id: 'register:cancel', title: 'Cancelar' }
      ],
      token,
      phoneNumberId
    });
    
    return;
  }
  
  if (state.step === 'confirm') {
    // Handle confirmation buttons and text fallbacks
    const t = textOrPostback.toLowerCase();
    
    if (textOrPostback === 'register:confirm' || t === 'confirmar' || t === 'confirm') {
      await confirmRegistration(ctx, state);
      return;
    }
    
    if (textOrPostback === 'register:edit:full_name' || t === 'editar') {
      state.step = 'ask_full_name';
      await updateRegistrationState(pool, from, user?.id, hotelId, state);
      
      await sendWhatsAppText({
        to,
        text: "Ok. Escribe de nuevo *Nombre y Apellido* (Ej.: \"Ana López\").",
        token,
        phoneNumberId
      });
      return;
    }
    
    if (textOrPostback === 'register:cancel' || t === 'cancelar' || t === 'cancel') {
      await cancelRegistration(ctx);
      return;
    }
  }
}

/**
 * Confirms registration and inserts user into database
 */
async function confirmRegistration(ctx, state) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  logger.info({ flow: 'register', action: 'confirmRegistration', phone: state.phone });
  
  try {
    // Insert user with email
    const result = await insertGuestUser(pool, {
      first_name: state.first_name,
      last_name: state.last_name,
      email: state.email,
      phone: state.phone,
      avatar: null,
      timezone: 'America/Mexico_City',
      language: 'es',
      last_login: null,
      role: 'guest',
      hotel_id: 6,
      subscription_id: null,
      is_active: 1
    });
    
    // Log success or duplicate
    logger.info({ 
      flow: 'register', 
      action: 'confirm', 
      step: 'insertGuestUser',
      userId: result.id, 
      existed: result.existed 
    });
    
    // Clear state
    await clearRegistrationState(pool, from, ctx.user?.id);
    
    if (result.existed) {
      // User already existed by phone
      await sendWhatsAppText({
        to,
        text: "Ya encontramos tu cuenta por teléfono. ¡Listo!",
        token,
        phoneNumberId
      });
    } else {
      // New user created
      await sendWhatsAppText({
        to,
        text: `¡Registro completado! Bienvenido/a, ${state.first_name}.`,
        token,
        phoneNumberId
      });
    }
    
    // Now tell user to write "hola" to access guest menu
    await sendWhatsAppText({
      to,
      text: "Escribe *hola* para comenzar a usar el sistema.",
      token,
      phoneNumberId
    });
    
  } catch (err) {
    logger.error({ 
      flow: 'register', 
      action: 'confirm', 
      step: 'error',
      error: err.message,
      stack: err.stack
    });
    
    await sendWhatsAppText({
      to,
      text: "Tuvimos un problema al registrar. Intenta nuevamente.",
      token,
      phoneNumberId
    });
  }
}

/**
 * Cancels registration and returns to guest menu
 */
export async function cancelRegistration(ctx) {
  const { to, token, phoneNumberId, pool, from, user } = ctx;
  
  logger.info({ flow: 'register', action: 'cancelRegistration', to });
  
  // Clear state
  await clearRegistrationState(pool, from, user?.id);
  
  await sendWhatsAppText({
    to,
    text: "Registro cancelado.",
    token,
    phoneNumberId
  });
  
  await showGuestMenu({ to, token, phoneNumberId });
}