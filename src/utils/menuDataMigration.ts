// src/utils/menuDataMigration.ts
import { Recipe } from "../domain/types";

const STORAGE_VERSION_KEY = "__version";
const CURRENT_STORAGE_VERSION = "menuData.v2"; // v2 = recipeId-based

export function migrateMenuDataNamesToIds(menuData: any, recipes: Recipe[]): any {
  if (!menuData) return menuData;

  const byName = new Map(recipes.map(r => [r.name, r]));
  const clone = structuredClone(menuData);

  for (const dayKey of Object.keys(clone)) {
    if (dayKey === STORAGE_VERSION_KEY) continue;
    const day = clone[dayKey];
    if (typeof day !== 'object' || day === null) continue;

    for (const slot of ["mittag", "abend"]) {
      if (!day?.[slot]) continue;
      for (const catKey of Object.keys(day[slot])) {
        const val = day[slot][catKey];
        // Heuristic: Names are typically single strings without hyphens, whereas our IDs often contain them.
        if (typeof val === "string" && val && !val.includes("-")) {
          const hit = byName.get(val);
          if (hit) {
            day[slot][catKey] = hit.recipeId;
          }
        }
      }
    }
  }

  clone[STORAGE_VERSION_KEY] = CURRENT_STORAGE_VERSION;
  return clone;
}

export function needsMigration(obj: any): boolean {
  return !obj?.[STORAGE_VERSION_KEY] || obj[STORAGE_VERSION_KEY] !== CURRENT_STORAGE_VERSION;
}