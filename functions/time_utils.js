// time_utils.js - Time normalization and validation utilities
import { DateTime } from 'luxon';

// Default timezone for Mexico
export const MX_TZ = 'America/Mexico_City';

// Devuelve true si isoYmd ('YYYY-MM-DD') es ANTERIOR al día actual en TZ dada
export function isPastDateYMD(isoYmd, tz = MX_TZ) {
  if (!isoYmd) return false;
  const today = DateTime.now().setZone(tz).startOf('day');
  const d = DateTime.fromISO(isoYmd, { zone: tz }).startOf('day');
  return d < today;
}

// Hoy en ISO (Y-M-D) en TZ dada
export function todayIso(tz = MX_TZ) {
  return DateTime.now().setZone(tz).toISODate(); // 'YYYY-MM-DD'
}

// Hoy en DMY para mostrar
export function todayDMY(tz = MX_TZ) {
  return DateTime.now().setZone(tz).toFormat('dd/LL/yy');
}

/**
 * Generate error message for past dates
 * @param {string} tz - Timezone (default: America/Mexico_City)
 * @returns {string} Error message with current date
 */
export const MSG_DATE_PAST = (tz = MX_TZ) =>
  `La fecha no puede ser anterior a hoy (${todayDMY(tz)}). ` +
  `Por favor escribe una fecha válida en formato DD/MM/AA o usa "hoy" o "mañana".`;

/**
 * Formatea un timestamp ISO/SQL en UTC para mostrarlo en MX (DD/MM/AA HH:mm)
 * Acepta: '2025-10-23T18:32:10Z' o '2025-10-23 18:32:10'
 */
export function formatUTCAsMX(isoOrSql) {
  if (!isoOrSql) return '';
  // Soporta 'YYYY-MM-DD HH:mm:ss' desde MySQL
  const normalized = String(isoOrSql).replace(' ', 'T').replace(/Z?$/, 'Z');
  const dt = DateTime.fromISO(normalized, { zone: 'utc' }).setZone(MX_TZ);
  return dt.isValid ? dt.toFormat('dd/LL/yy HH:mm') : String(isoOrSql);
}

/**
 * Converts "hoy"/"mañana" or "DD/MM/AA" to 'YYYY-MM-DD' (ISO date) using TZ MX.
 * @param {string} input - User input (e.g., "hoy", "mañana", "17/10/25")
 * @param {string} tz - Timezone (default: America/Mexico_City)
 * @returns {string|null} ISO date string or null if invalid
 */
export function parseDateInputWithRelative(input, tz = MX_TZ) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes

  const now = DateTime.now().setZone(tz);
  if (normalized === 'hoy') {
    return now.toISODate(); // siempre el día calendario actual en TZ dada
  }
  if (normalized === 'manana' || normalized === 'mañana') {
    return now.plus({ days: 1 }).toISODate();
  }

  // fallback a DD/MM/AA(o AAAA) existente
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/.exec(raw);
  if (!m) return null;
  let [ , d, mo, y ] = m;
  if (y.length === 2) y = (Number(y) + 2000).toString();
  const dt = DateTime.fromObject({ day: Number(d), month: Number(mo), year: Number(y) }, { zone: tz });
  return dt.isValid ? dt.toISODate() : null;
}

/**
 * Format ISO date as DD/MM/YY for display
 * @param {string} iso - ISO date string (YYYY-MM-DD)
 * @param {string} tz - Timezone (default: America/Mexico_City)
 * @returns {string} Formatted date string or original input if invalid
 */
export function formatISOasDMY(iso, tz = MX_TZ) {
  const dt = DateTime.fromISO(iso, { zone: tz });
  return dt.isValid ? dt.toFormat('dd/LL/yy') : iso;
}

/**
 * Converts "12" or "12:00" to "HH:MM" valid format, or null.
 * Accepts formats like "12", "12:00", "9", "09:30"
 * Returns normalized "HH:MM" or null if invalid
 */
export function normalizeHHMM(input) {
  const raw = String(input || "").trim().replace(/[^\d:]/g, "");
  
  // Handle "12" -> "12:00"
  if (/^\d{1,2}$/.test(raw)) {
    const h = String(Number(raw)).padStart(2, "0");
    const hour = Number(raw);
    if (hour < 0 || hour > 23) return null;
    return `${h}:00`;
  }
  
  // Handle "12:00" or "9:30" format
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  
  const h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Converts "HH:MM" to minutes since 00:00
 */
export function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Validates if t is within [open, close) allowing close to be "00:00" (= 24:00) 
 * and allowing the range to cross midnight.
 * 
 * Examples:
 * - isTimeInRange("12:00", "11:00", "00:00") -> true (11:00-00:00 means 11:00-24:00)
 * - isTimeInRange("01:30", "11:00", "00:00") -> false (after midnight but range doesn't wrap)
 * - isTimeInRange("23:00", "18:00", "02:00") -> true (range crosses midnight)
 * - isTimeInRange("01:00", "18:00", "02:00") -> true (in wrapped portion)
 */
export function isTimeInRange(tHHMM, openHHMM, closeHHMM) {
  let open = hhmmToMinutes(openHHMM);
  let close = hhmmToMinutes(closeHHMM);
  const t = hhmmToMinutes(tHHMM);

  // "00:00" as close = 24:00 (end of day)
  if (close === 0) close = 24 * 60;

  // Normal range (no midnight crossing)
  if (open < close) {
    return t >= open && t < close;
  }

  // Range crosses midnight (e.g., 18:00–02:00)
  return t >= open || t < close;
}