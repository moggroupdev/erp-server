/**
 * Shared constants for purchasing / inventory seed and cleanup scripts.
 * Keep SEED_IMPORT_NOTE identical across scripts that create or target seeded rows.
 */

/** Notes stamped on MPOs / MPRs / IVTs created by seed:inventory-receipts. */
export const SEED_IMPORT_NOTE = 'تم إدخال هذه البيانات آلياً من ملفات النظام القديم.';

/**
 * Cutoff for delete:seeded-purchasing-before-cutoff.
 * Deletes seeded MPOs with createdAt strictly before this instant (Cairo / UTC+3).
 * Change this value when re-running against a different historical window.
 */
export const PURCHASING_RESEED_CUTOFF = new Date('2026-07-01T00:00:00+03:00');
