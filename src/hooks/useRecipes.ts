import { useState, useEffect } from 'react';
import { Recipe, PortionConfig, Ingredient, FoodGroup, Allergen } from '../domain/types';
import { validateRecipes } from '../domain/guards';

// Defines the location and structure of the recipe data files.
const DATA_FILES = [
  { path: '/Suppe.json', key: 'suppe', primaryCategory: 'suppe' },
  { path: '/Dessert.json', key: 'dessert', primaryCategory: 'dessert' },
  // CORRECTED: The key for Fleischgerichte.json is now 'fleischgerichte' to match the file's content.
  { path: '/Fleischgerichte.json', key: 'fleischgerichte', primaryCategory: 'fleisch' },
  { path: '/Fisch.json', key: 'fisch', primaryCategory: 'fisch' },
  { path: '/Vegetarisch.json', key: 'vegetarisch', primaryCategory: 'vegi' },
  { path: '/abendessen.json', key: 'abendessen', primaryCategory: 'abend' },
];

// Maps German allergen names to a canonical English key.
const allergenMap: Record<string, Allergen> = {
  "Gluten":"gluten","Milch":"milk","Eier":"egg","Soja":"soy","Nüsse":"nuts","Erdnüsse":"peanuts",
  "Fisch":"fish","Krebstiere":"crustaceans","Sellerie":"celery","Senf":"mustard","Sesam":"sesame",
  "Lupine":"lupin","Schwefeldioxid":"sulphites", "Schwefeldioxid/Sulphite": "sulphites", "Weichtiere":"molluscs"
};

// Normalizes an array of allergen strings to the canonical Allergen type.
function normalizeAllergens(list: (string | Allergen)[] = []): Allergen[] {
  const mapped = list.map(a => allergenMap[a] ?? a.toLowerCase());
  return Array.from(new Set(mapped)).filter(Boolean) as Allergen[];
}

// Transforms raw recipe data into the canonical Recipe type.
const transformToCanonicalRecipe = (
    raw: any,
    sourceCategory: string
): Recipe => {
    const ingredients: Ingredient[] = (raw.ingredients || []).map((ing: any) => ({
      ingredientId: ing.ingredientId || ing.name,
      name: ing.name,
      qtyPerBasePortionG: ing.qtyPerBasePortionG || ing.grams || 0,
      yield: ing.yield ?? 1,
      packSizeG: ing.packSizeG,
      categoryKey: ing.categoryKey || 'dry_goods',
    }));

    const portion: PortionConfig = {
      basePortionG: raw.portion.basePortionG,
      portionGByGroup: raw.portion.portionGByGroup ?? {
        erwachsene: raw.portion.basePortionG,
        senioren: Math.round(raw.portion.basePortionG * 0.87),
        kinder: Math.round(raw.portion.basePortionG * 0.67),
      },
    };

    return {
        recipeId: raw.recipeId,
        name: raw.name,
        allergens: normalizeAllergens(raw.allergens),
        foodGroup: raw.foodGroup as FoodGroup || 'protein',
        isVollkorn: raw.isVollkorn || false,
        nutrition: raw.nutrition,
        portion,
        ingredients,
        sourceCategory: raw.sourceCategory || sourceCategory,
    };
};

// Custom React hook to fetch, process, and provide all recipe data.
export const useRecipes = () => {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [orderMeta, setOrderMeta] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndTransformRecipes = async () => {
      try {
        // Fetch all data files in parallel.
        const [fetchedOrderMeta, ...recipeResponses] = await Promise.all([
            fetch('/orderMeta.json').then(res => res.json()),
            ...DATA_FILES.map(fileInfo => fetch(fileInfo.path).then(res => {
              if (!res.ok) {
                throw new Error(`Failed to load ${fileInfo.path}: ${res.statusText}`);
              }
              return res.json();
            })),
        ]);

        setOrderMeta(fetchedOrderMeta);

        const allRawRecipes: any[] = [];
        recipeResponses.forEach((json, index) => {
          const fileInfo = DATA_FILES[index];
          // CORRECTED: This simplified logic now works for all files.
          const recipesArray: any[] = json[fileInfo.key] || [];

          recipesArray.forEach((raw: any) => {
              allRawRecipes.push({ ...raw, _sourceCategory: fileInfo.primaryCategory });
          });
        });

        const recipeMap = new Map<string, Recipe>();
        allRawRecipes.forEach(raw => {
          const canonical = transformToCanonicalRecipe(raw, raw._sourceCategory);
          if (!recipeMap.has(canonical.recipeId)) {
            recipeMap.set(canonical.recipeId, canonical);
          }
        });
        
        const validatedRecipes = validateRecipes(Array.from(recipeMap.values()));
        setRecipes(validatedRecipes);

      } catch (err: any) {
        console.error("Recipe loading/processing error:", err);
        setError(err.message || 'Fehler beim Laden oder Verarbeiten der Rezeptdaten.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndTransformRecipes();
  }, []);

  return { recipes, orderMeta, isLoading, error };
};
