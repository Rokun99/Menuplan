import { useMemo } from 'react';
import { Recipe } from './useRecipes';
import { evaluateMenuDay, NutritionReport } from '../rules/nutritionRules';

const getNutritionStatus = (report: NutritionReport | null): 'good' | 'average' | 'bad' | 'neutral' => {
    if (!report) return 'neutral';
    if (report.warnings.length > 0 && report.warnings.some(w => !w.startsWith("Keine Gerichte"))) return 'bad';
    if (report.suggestions.length > 0 && !report.suggestions.some(s => s.includes("ausgewogen"))) return 'average';
    if (report.warnings.length === 0 && report.suggestions.some(s => s.includes("ausgewogen"))) return 'good';
    return 'neutral';
};

export const useDayNutrition = (
    dayPlan: any,
    recipeMap: Map<string, Recipe>,
    portionEstimates: any
) => {
    const { mittagMeals, abendMeals } = useMemo(() => {
        const mMeals = [
            recipeMap.get(dayPlan?.mittag?.suppe ?? ''),
            recipeMap.get(dayPlan?.mittag?.dessert ?? ''),
            recipeMap.get(dayPlan?.mittag?.menu ?? ''),
            recipeMap.get(dayPlan?.mittag?.vegi ?? ''),
        ];
        const aMeals = [
            recipeMap.get(dayPlan?.abend?.menu ?? ''),
            recipeMap.get(dayPlan?.abend?.vegi ?? ''),
        ];
        return { mittagMeals: mMeals, abendMeals: aMeals };
    }, [dayPlan, recipeMap]);

    const nutritionReport = useMemo(() => {
        const allMeals = [...mittagMeals, ...abendMeals];
        if (allMeals.every(m => m === undefined) || !dayPlan) {
            return null;
        }
        return evaluateMenuDay(mittagMeals, abendMeals, dayPlan.servings, portionEstimates);
    }, [mittagMeals, abendMeals, dayPlan, portionEstimates]);

    const nutritionStatus = getNutritionStatus(nutritionReport);

    return { nutritionReport, nutritionStatus };
};
