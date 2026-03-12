// price.js - Pricing logic and date utilities

export function formatMXN(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

export function formatMoneyMXN(num) {
  return formatMXN(num);
}

// Parse local date (handles YYYY-MM-DD as local date, not UTC)
function parseLocalDate(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function getPriceForDate(room, dateISO) {
  const date = dateISO ? parseLocalDate(dateISO) : new Date();
  if (!date) {
    const base = Number(room.price);
    return Number.isFinite(base) ? base : 0;
  }
  
  const dow = date.getDay();
  const map = {
    0: "price_sunday", 1: "price_monday", 2: "price_tuesday", 3: "price_wednesday",
    4: "price_thursday", 5: "price_friday", 6: "price_saturday",
  };
  const col = map[dow];
  const val = Number(room[col]);
  if (Number.isFinite(val) && val > 0) return val;
  
  const base = Number(room.price);
  return Number.isFinite(base) ? base : 0;
}

// Date parsing from DD/MM/YY or DD/MM/YYYY
export function parseDMY2ToISO(raw) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(String(raw).trim());
  if (!m) return null;
  let [, dd, mm, yy] = m;
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  const y = +yyyy, M = +mm, d = +dd;
  const dt = new Date(y, M - 1, d);
  if (dt.getFullYear() !== y || (dt.getMonth() + 1) !== M || dt.getDate() !== d) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDMYtoISO(raw) {
  return parseDMY2ToISO(raw);
}

export function formatDateDMY2(isoYmd) {
  if (!isoYmd) return '';
  const [y, m, d] = isoYmd.split('-');
  const yy = y?.slice(-2) || '';
  return `${d}/${m}/${yy}`;
}

export function formatDateMX(isoYmd) {
  if (!isoYmd) return '';
  const [y, m, d] = isoYmd.split('-');
  return `${d}/${m}/${y}`;
}

export function diffNights(yyyyMmDdIn, yyyyMmDdOut) {
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  const dtIn = new Date(yyyyMmDdIn + 'T00:00:00');
  const dtOut = new Date(yyyyMmDdOut + 'T00:00:00');
  if (isNaN(dtIn.getTime()) || isNaN(dtOut.getTime())) return 0;
  return Math.floor((dtOut - dtIn) / MILLISECONDS_PER_DAY);
}

export function eachDateISO(startISO, endISO) {
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  const dtStart = new Date(startISO + 'T00:00:00');
  const dtEnd = new Date(endISO + 'T00:00:00');
  if (isNaN(dtStart.getTime()) || isNaN(dtEnd.getTime())) return [];
  
  const arr = [];
  let current = new Date(dtStart);
  while (current < dtEnd) {
    const yy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    arr.push(`${yy}-${mm}-${dd}`);
    current = new Date(current.getTime() + MILLISECONDS_PER_DAY);
  }
  return arr;
}

export function computeRoomTotalByDates(room, dateListISO) {
  return dateListISO.reduce((sum, d) => sum + getPriceForDate(room, d), 0);
}

export function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidIso(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Amenity time utilities
export function parseHHMM(raw) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw).trim());
  if (!m) return null;
  const [, hh, mm] = m;
  const h = +hh, min = +mm;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${mm}`;
}

// Parse time in HH:MM format (24h) with strict validation
export function parseTimeHHMM(raw) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(raw).trim());
  if (!m) return null;
  return `${m[1]}:${m[2]}`; // 'HH:MM'
}

export function withinTime(hhmm, open, close) {
  if (!hhmm || !open || !close) return true;
  return hhmm >= open && hhmm <= close;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Text normalization
export function normalizeUserText(s = '') {
  return String(s).replace(/[\u00A0\u202F\u2007\u2060]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function digitsChatId(from) {
  return (from || '').replace(/\D+/g, '');
}

// === New utility functions for table reservations ===

// Parse Mexican date format (DD/MM/YY or DD/MM/YYYY) to ISO (YYYY-MM-DD)
export function parseMxDate(d) {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (!m) return null;
  let [ , dd, mm, yy ] = m;
  dd = dd.padStart(2,'0'); 
  mm = mm.padStart(2,'0');
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  const iso = `${yyyy}-${mm}-${dd}`;
  const dt = new Date(iso);
  return (dt instanceof Date && !Number.isNaN(dt.valueOf())) ? iso : null;
}

// Parse integer with strict validation
export function parseIntStrict(s, min = 1, max = 50) {
  const n = Number(String(s).trim());
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

// Format ISO date (YYYY-MM-DD) to DD/MM/YY
export function formatDMY(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y.slice(-2)}`;
}