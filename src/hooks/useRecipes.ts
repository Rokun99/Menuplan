import { useState, useEffect } from 'react';
import { Recipe, Nutrition, PortionConfig, Ingredient, FoodGroup, Allergen } from '../domain/types';
import { validateRecipes } from '../domain/guards';

const DATA_FILES = [
  { path: '/Suppe.json', key: 'suppe', primaryCategory: 'suppe', canonical: true },
  { path: '/Dessert.json', key: 'dessert', primaryCategory: 'dessert', canonical: true },
  { path: '/Fleischgerichte.json', key: 'recipes', primaryCategory: 'fleisch', canonical: true },
  { path: '/Fisch.json', key: 'fisch', primaryCategory: 'fisch', canonical: false },
  { path: '/Vegetarisch.json', key: 'vegetarisch', primaryCategory: 'vegi', canonical: true },
  { path: '/abendessen.json', key: 'abendessen', primaryCategory: 'abend', canonical: true },
];

const allergenMap: Record<string, Allergen> = {
  "Gluten":"gluten","Milch":"milk","Eier":"egg","Soja":"soy","Nüsse":"nuts","Erdnüsse":"peanuts",
  "Fisch":"fish","Krebstiere":"crustaceans","Sellerie":"celery","Senf":"mustard","Sesam":"sesame",
  "Lupine":"lupin","Schwefeldioxid":"sulphites", "Schwefeldioxid/Sulphite": "sulphites", "Weichtiere":"molluscs"
};

function normalizeAllergens(list: (string | Allergen)[] = []): Allergen[] {
  const mapped = list.map(a => allergenMap[a] ?? a.toLowerCase());
  return Array.from(new Set(mapped)).filter(Boolean) as Allergen[];
}

const transformToCanonicalRecipe = (
    raw: any,
    sourceCategory: string,
    portionEstimates: Record<string, number>,
    orderMeta: any
): Recipe => {
    // Check if it's already in the new canonical format
    if (raw.recipeId && raw.nutrition && raw.portion) {
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
    }

    // It's a legacy format, transform it
    const basePortionG = portionEstimates[raw.foodGroup as string] || 300;
    const nutrition: Nutrition = {
        kind: 'PER_PORTION',
        kcalPerPortion: raw.kcal || 0,
        proteinPerPortion: raw.protein || 0,
        fatPerPortion: raw.fat || 0,
        basePortionG: basePortionG,
    };
    const portion: PortionConfig = {
        basePortionG,
        portionGByGroup: {
          erwachsene: basePortionG,
          senioren: Math.round(basePortionG * 0.87),
          kinder: Math.round(basePortionG * 0.67),
        },
    };
    const ingredients: Ingredient[] = (raw.ingredients || []).map((ing: any) => {
        const meta = orderMeta[ing.name] || {};
        return {
            ingredientId: ing.name,
            name: ing.name,
            qtyPerBasePortionG: ing.grams || 0,
            yield: 1 - ((meta.wastePct || 0) / 100),
            packSizeG: meta.packSizeKg ? meta.packSizeKg * 1000 : undefined,
            categoryKey: meta.supplier || ing.category || 'dry_goods',
        };
    });

    return {
        recipeId: raw.name,
        name: raw.name,
        allergens: normalizeAllergens(raw.allergens),
        foodGroup: raw.foodGroup as FoodGroup || 'protein',
        isVollkorn: raw.isVollkorn || false,
        nutrition,
        portion,
        ingredients,
        sourceCategory: sourceCategory,
    };
};

export const useRecipes = () => {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [orderMeta, setOrderMeta] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndTransformRecipes = async () => {
      try {
        const [portionEstimates, fetchedOrderMeta, ...recipeResponses] = await Promise.all([
            fetch('/portionEstimates.json').then(res => res.json()),
            fetch('/orderMeta.json').then(res => res.json()),
            ...DATA_FILES.map(fileInfo => fetch(fileInfo.path).then(res => res.json())),
        ]);

        setOrderMeta(fetchedOrderMeta);

        const allRawRecipes: any[] = [];
        recipeResponses.forEach((json, index) => {
          const fileInfo = DATA_FILES[index];
          let recipesArray: any[] = [];
          if (fileInfo.canonical) {
             recipesArray = json.recipes || json[fileInfo.key] || [];
             if (fileInfo.key === 'abendessen') {
                recipesArray = Object.values(json[fileInfo.key]).flat();
             }
          } else {
             recipesArray = json[fileInfo.key] || [];
          }

          recipesArray.forEach((raw: any) => {
              allRawRecipes.push({ ...raw, _sourceCategory: fileInfo.primaryCategory });
          });
        });

        const recipeMap = new Map<string, Recipe>();
        allRawRecipes.forEach(raw => {
          const canonical = transformToCanonicalRecipe(raw, raw._sourceCategory, portionEstimates, fetchedOrderMeta);
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