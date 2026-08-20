/**
 * point-reference.js
 * ===================
 * DEPRECATED. Point title/summary/logic/dataPoints/scope now live in the
 * database (AuditPointConfig table) — see utility/point-definitions.js and
 * scripts/seed-point-definitions.js, which is the only remaining place the
 * English text is written down (purely to seed the DB once).
 *
 * This file is kept ONLY as a compatibility shim so any import you haven't
 * updated yet doesn't crash at boot. It re-exports the OLD names but now
 * backed by whatever is cached in point-definitions.js at the time of
 * import — which means POINT_DEFINITIONS below will be EMPTY until
 * ensurePointDefinitionsLoaded() has been awaited at least once elsewhere
 * in the request lifecycle (e.g. in a controller's top-of-handler call,
 * same pattern as ensureSeverityLoaded()).
 *
 * ACTION ITEM: grep your codebase for `from "../utility/point-reference.js"`
 * (or wherever this file lives) and switch every call site to import from
 * utility/point-definitions.js directly (getPointDefinition,
 * listPointDefinitions, listHeaderPointDefinitions,
 * listLinePointDefinitions) instead. Once nothing imports this file,
 * delete it.
 */
import {
  listPointDefinitions,
  getPointDefinition,
  KPI_DEFINITIONS,
  CHART_DEFINITIONS,
} from "./point-definitions.js";

console.warn(
  "[deprecated] point-reference.js is imported somewhere - point content now lives in the DB. See utility/point-definitions.js.",
);

export const POINT_DEFINITIONS = listPointDefinitions();

export const POINT_DEFINITIONS_BY_NO = Object.fromEntries(
  POINT_DEFINITIONS.map((p) => [p.pointNo, p]),
);

export { KPI_DEFINITIONS, CHART_DEFINITIONS };

// Convenience re-export in case some call site wants a single lookup
// instead of the full list/map above.
export { getPointDefinition };
