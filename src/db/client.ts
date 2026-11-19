/**
 * Backward-compatible name for the server-only database boundary.
 * Prefer importing from `src/db` in new code.
 */
export { db, pool } from "./index";
export type { Database } from "./index";
