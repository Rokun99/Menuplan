
import { Recipe } from '../hooks/useRecipes';

// Daily targets for a 62kg resident, based on the guide
export const DAILY_TARGETS = {
  kcal: { min: 1700, max: 2000 },
  protein: { min: 62, max: 74 }, // 1.0-1.2g per kg
  fat_percent: { max: 0.40 }, // 40% of kcal
  vollkorn_portions: { min: 1 }
};

export const FOOD_GROUP_TARGETS = {
  vegetable: { min: 3, max: 5, name: 'Gemüse/Früchte' },
  fruit: { min: 2, max: 3, name: 'Gemüse/Früchte' },
  starch: { min: 3, max: 3, name: 'Stärkebeilagen' },
  protein: { min: 1, max: 2, name: 'Protein (Fleisch/Fisch/etc.)' },
  dairy: { min: 3, max: 4, name: 'Milchprodukte' }
};

export interface NutritionReport {
    warnings: string[];
    suggestions: string[];
}

export interface DishEvaluationResult {
    score: 'good' | 'average' | 'bad' | 'neutral';
    reason: string;
}

const countFoodGroups = (meals: (Recipe | undefined)[]) => {
    const counts: { [key: string]: number } = {
        vegetable: 0, fruit: 0, starch: 0, protein: 0, dairy: 0
    };
    meals.forEach(meal => {
        if (meal && counts[meal.foodGroup] !== undefined) {
            counts[meal.foodGroup]++;
        }
    });
    return counts;
};

export const evaluateMenuDay = (
    mittagMeals: (Recipe | undefined)[], 
    abendMeals: (Recipe | undefined)[],
    servings: number,
    portionEstimates: any
): NutritionReport => {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    const allMeals = [...mittagMeals, ...abendMeals].filter(Boolean) as Recipe[];
    
    if (allMeals.length === 0) {
        return { warnings: ["Keine Gerichte für eine Analyse geplant."], suggestions: [] };
    }
    
    if (!portionEstimates) {
        return { warnings: ["Portions-Daten werden geladen..."], suggestions: [] };
    }

    let totalKcal = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let vollkornPortions = 0;

    allMeals.forEach(meal => {
        const portionSize = (portionEstimates as any)[meal.foodGroup] || 100;
        const multiplier = portionSize / 100;
        totalKcal += meal.kcal * multiplier;
        totalProtein += meal.protein * multiplier;
        totalFat += meal.fat * multiplier;
        if(meal.isVollkorn) vollkornPortions++;
    });

    // Check overall nutrition
    if (totalKcal < DAILY_TARGETS.kcal.min) warnings.push(`Kalorienziel (min. ${DAILY_TARGETS.kcal.min}) nicht erreicht. Aktuell: ~${Math.round(totalKcal)} kcal.`);
    if (totalKcal > DAILY_TARGETS.kcal.max) warnings.push(`Kalorienziel (max. ${DAILY_TARGETS.kcal.max}) überschritten. Aktuell: ~${Math.round(totalKcal)} kcal.`);
    if (totalProtein < DAILY_TARGETS.protein.min) warnings.push(`Proteinziel (min. ${DAILY_TARGETS.protein.min}g) nicht erreicht. Aktuell: ~${Math.round(totalProtein)}g.`);
    if ((totalFat * 9) / totalKcal > DAILY_TARGETS.fat_percent.max) warnings.push(`Fettanteil von ${Math.round(DAILY_TARGETS.fat_percent.max*100)}% überschritten.`);
    
    // Check food groups
    const groupCounts = countFoodGroups(allMeals);
    const totalVegFruit = groupCounts.vegetable + groupCounts.fruit;
    if (totalVegFruit < 5) suggestions.push(`Ziel für Gemüse/Früchte (5) nicht erreicht. Aktuell: ${totalVegFruit}.`);
    if (groupCounts.starch < FOOD_GROUP_TARGETS.starch.min) suggestions.push(`Zu wenig Stärkebeilagen (Ziel: ${FOOD_GROUP_TARGETS.starch.min}). Aktuell: ${groupCounts.starch}.`);
    if (groupCounts.protein < FOOD_GROUP_TARGETS.protein.min) suggestions.push(`Proteinquelle (Fleisch/Fisch/etc.) fehlt oder ist zu wenig.`);
    if (groupCounts.dairy < FOOD_GROUP_TARGETS.dairy.min) suggestions.push(`Zu wenig Milchprodukte (Ziel: ${FOOD_GROUP_TARGETS.dairy.min}). Aktuell: ${groupCounts.dairy}.`);

    if(vollkornPortions < DAILY_TARGETS.vollkorn_portions.min) {
        suggestions.push("Eine Vollkorn-Portion pro Tag wird empfohlen.");
    }
    
    if(warnings.length === 0 && suggestions.length === 0) {
        suggestions.push("Die Tagesplanung scheint ausgewogen zu sein.");
    }

    return { warnings, suggestions };
};


export const evaluateDishInContext = (dish: Recipe, currentDayPlan: Recipe[]): DishEvaluationResult => {
    const groupCounts = countFoodGroups(currentDayPlan);

    // Rule: Avoid adding a 3rd starch if 2 are already planned
    if (dish.foodGroup === 'starch' && groupCounts.starch >= 2) {
        return { score: 'bad', reason: 'Bereits 2 Stärkebeilagen an diesem Tag geplant.' };
    }

    // Rule: Avoid adding a 3rd protein source
    if (dish.foodGroup === 'protein' && groupCounts.protein >= 2) {
        return { score: 'average', reason: 'Eine 2. Proteinquelle ist bereits vorhanden.' };
    }

    // Rule: Encourage whole grains if none are present
    if (dish.isVollkorn && !currentDayPlan.some(m => m.isVollkorn)) {
        return { score: 'good', reason: 'Gute Wahl als Vollkorn-Option.' };
    }
    
    // Rule: Encourage vegetables/fruits if below target
    const vegFruitCount = groupCounts.vegetable + groupCounts.fruit;
    if ((dish.foodGroup === 'vegetable' || dish.foodGroup === 'fruit') && vegFruitCount < 4) {
         return { score: 'good', reason: 'Hilft, das Gemüse/Früchte-Ziel zu erreichen.' };
    }

    return { score: 'neutral', reason: '' };
};
