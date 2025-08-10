
import { useMemo } from 'react';
import { Recipe } from './useRecipes';
import { evaluateMenuDay, NutritionReport } from '../rules/nutritionRules';

export const useNutritionCheck = (
    mittagMeals: (Recipe | undefined)[], 
    abendMeals: (Recipe | undefined)[],
    servings: number,
    portionEstimates: any
): NutritionReport | null => {

    const report = useMemo(() => {
        const allMeals = [...mittagMeals, ...abendMeals];
        if (allMeals.every(m => m === undefined)) {
            return null;
        }
        return evaluateMenuDay(mittagMeals, abendMeals, servings, portionEstimates);
    }, [mittagMeals, abendMeals, servings, portionEstimates]);

    return report;
};

export type { NutritionReport };
