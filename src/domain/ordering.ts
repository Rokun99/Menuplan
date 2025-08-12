import { Recipe, PersonsByGroup, OrderLine, GroupKey } from './types';

const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function toAP(ep: number, y = 1) {
  const yieldFactor = (typeof y === "number" && y > 0 && y <= 1) ? y : 1;
  return ep / yieldFactor;
}
function packCount(apG: number, packSizeG?: number) {
  if (!packSizeG || packSizeG <= 0) return { packs: 0, totalG: apG };
  const packs = Math.ceil(apG / packSizeG);
  return { packs, totalG: packs * packSizeG };
}

function ingredientOrderForRecipe(recipe: Recipe, persons: PersonsByGroup): { lines: Omit<OrderLine, 'categoryKey'>[], warnings: string[] } {
  const baseG = recipe.portion.basePortionG;
  if (baseG === 0) return { lines: [], warnings: [`"${recipe.name}" has a base portion of 0.`] };
  
  const warnings: string[] = [];

  const lines = recipe.ingredients.map((ing) => {
    let netRequiredG = 0;
    
    const totalPortionsScaled = (Object.keys(persons) as GroupKey[]).reduce((sum, group) => {
        const count = persons[group] || 0;
        const portionG = recipe.portion.portionGByGroup[group];
        if (portionG === undefined) {
          warnings.push(`"${recipe.name}" uses default portion size for group "${group}".`);
        }
        return sum + (count * (portionG ?? baseG));
    }, 0);

    const portionMultiplier = totalPortionsScaled / baseG;
    netRequiredG = (ing.qtyPerBasePortionG || 0) * portionMultiplier;

    const grossRequiredG = toAP(netRequiredG, ing.yield);
    
    const line = {
      ingredientId: ing.ingredientId, name: ing.name,
      netRequiredG, grossRequiredG,
      packSizeG: ing.packSizeG,
    };
    return line;
  });

  return { lines, warnings: [...new Set(warnings)] };
}


export function aggregateWeeklyOrder(menuData: any, recipeMap: Map<string, Recipe>): { orderLines: OrderLine[], warnings: string[] } {
    const weeklyOrderLines = new Map<string, OrderLine>();
    const allWarnings = new Set<string>();

    const processRecipe = (recipe: Recipe, persons: PersonsByGroup) => {
        const { lines, warnings } = ingredientOrderForRecipe(recipe, persons);
        warnings.forEach(w => allWarnings.add(w));

        lines.forEach((line, index) => {
            const ing = recipe.ingredients[index];
            if (!ing) return;
            const existing = weeklyOrderLines.get(line.ingredientId);
            if (existing) {
                existing.netRequiredG += line.netRequiredG;
                existing.grossRequiredG += line.grossRequiredG;
            } else {
                weeklyOrderLines.set(line.ingredientId, { ...line, categoryKey: ing.categoryKey });
            }
        });
    };

    // 1. Aggregate daily meals
    DAYS.forEach(day => {
        const dayData = menuData[day];
        if (!dayData || !dayData.servings || dayData.servings <= 0) return;

        const persons: PersonsByGroup = {
            erwachsene: dayData.servings,
            senioren: 0, // TODO: Add UI for different groups
            kinder: 0,
        };
        
        const dailyMealIds = [
            dayData.mittag?.suppe, dayData.mittag?.dessert,
            dayData.mittag?.menu, dayData.mittag?.vegi,
            dayData.abend?.menu, dayData.abend?.vegi,
        ].filter(Boolean);

        dailyMealIds.forEach(id => {
            const recipe = recipeMap.get(id);
            if (recipe) processRecipe(recipe, persons);
        });
    });

    // 2. Aggregate weekly hits
    const representativeServings = menuData['Montag']?.servings || 120;
    const weeklyHitPersons: PersonsByGroup = { 
        erwachsene: representativeServings,
        senioren: 0,
        kinder: 0,
    };
    const weeklyHitIds = [
        menuData.wochenhitMittag1, menuData.wochenhitMittag2,
        ...(menuData.wochenhitAbend || [])
    ].filter(Boolean);
    
    weeklyHitIds.forEach(id => {
        const recipe = recipeMap.get(id);
        if (recipe) processRecipe(recipe, weeklyHitPersons);
    });

    // 3. Apply final rounding and pack calculations
    const finalOrderList = Array.from(weeklyOrderLines.values());
    finalOrderList.forEach(line => {
        line.netRequiredG = Math.round(line.netRequiredG);
        line.grossRequiredG = Math.round(line.grossRequiredG);
        const { packs, totalG } = packCount(line.grossRequiredG, line.packSizeG);
        line.packs = packs;
        line.orderQtyG = totalG;
    });

    return { orderLines: finalOrderList, warnings: Array.from(allWarnings) };
}