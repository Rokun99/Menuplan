// src/domain/guards.ts
import { Recipe } from "./types";

export function assertRecipe(r: any): asserts r is Recipe {
  if (!r?.recipeId || !r?.name) throw new Error(`Invalid recipe: missing recipeId/name. Found: ${JSON.stringify(r)}`);
  if (typeof r.portion?.basePortionG !== 'number') throw new Error(`Invalid recipe ${r.recipeId}: missing or invalid portion.basePortionG`);
  if (!Array.isArray(r.ingredients)) throw new Error(`Invalid recipe ${r.recipeId}: ingredients is not an array`);
  if (!r.nutrition?.kind) throw new Error(`Invalid recipe ${r.recipeId}: missing nutrition.kind`);
}

export function validateRecipes(recipes: any[]): Recipe[] {
  const ids = new Set<string>();
  for (const r of recipes) {
    assertRecipe(r);
    if (ids.has(r.recipeId)) {
        throw new Error(`Duplicate recipeId found: ${r.recipeId}`);
    }
    ids.add(r.recipeId);
  }
  return recipes as Recipe[];
}