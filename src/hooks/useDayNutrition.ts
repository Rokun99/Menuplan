import { useMemo } from 'react';
import { Recipe, PersonsByGroup } from '../domain/types';
import { evaluateMenuDay } from '../rules/nutritionRules';

export const useDayNutrition = (
    dayPlan: any,
    recipeMap: Map<string, Recipe>,
    mealType: 'mittag' | 'abend'
) => {
    const { nutritionReport, nutritionStatus } = useMemo(() => {
        if (!dayPlan || !dayPlan[mealType]) {
            return { nutritionReport: null, nutritionStatus: 'neutral' };
        }
        
        const mealSlots = dayPlan[mealType];
        const allMeals = Object.values(mealSlots)
            .map(id => recipeMap.get(id as string))
            .filter(Boolean) as Recipe[];

        if (allMeals.length === 0) {
             return { nutritionReport: null, nutritionStatus: 'neutral' };
        }
        
        const persons: PersonsByGroup = {
            erwachsene: dayPlan.servings || 120,
            senioren: 0,
            kinder: 0,
        };

        const report = evaluateMenuDay(allMeals, persons, mealType);

        return { nutritionReport: report, nutritionStatus: report.color };

    }, [dayPlan, recipeMap, mealType]);

    return { nutritionReport, nutritionStatus };
};