import { Recipe, PersonsByGroup, AmpelConfig } from '../domain/types';
import { computeMealAmpel, AmpelReport } from '../domain/calculations';

// Daily targets for a 62kg resident, based on the guide
export const DAILY_TARGETS = {
  kcal: { min: 1700, max: 2000 },
  protein: { min: 62, max: 74 }, // 1.0-1.2g per kg
};

const DAILY_AVG_KCAL = Math.round((DAILY_TARGETS.kcal.min + DAILY_TARGETS.kcal.max) / 2);
export const MEAL_TARGETS = {
  mittag: Math.round(DAILY_AVG_KCAL * 0.6), // Lunch gets a larger portion
  abend: Math.round(DAILY_AVG_KCAL * 0.4),  // Dinner gets a smaller portion
};

export interface DishEvaluationResult {
  score: 'good' | 'average' | 'bad' | 'neutral';
  reasons: string[];
  needsMoreProtein: boolean;
  totalCalories: number;
}

function kcalFromNutrition(r: Partial<Recipe>): number {
  const n: any = r.nutrition;
  const base = (r as any).portion?.basePortionG ?? 300;
  if (!n) return (r as any).kcal ?? 0;
  if (n.kind === 'PER_PORTION') return n.kcalPerPortion ?? ((r as any).kcal ?? 0);
  if (n.kind === 'PER_100G') return (n.kcalPer100g ?? 0) * (base / 100);
  return (r as any).kcal ?? 0;
}

function proteinFromNutrition(r: Partial<Recipe>): number {
  const n: any = r.nutrition;
  const base = (r as any).portion?.basePortionG ?? 300;
  if (!n) return (r as any).protein ?? 0;
  if (n.kind === 'PER_PORTION') return n.proteinPerPortion ?? ((r as any).protein ?? 0);
  if (n.kind === 'PER_100G') return (n.proteinPer100g ?? 0) * (base / 100);
  return (r as any).protein ?? 0;
}


/**
 * Acts as a bridge to the canonical domain function `computeMealAmpel`.
 * Computes the traffic light for a specific meal (mittag or abend), not the whole day.
 */
export const evaluateMenuDay = (
  allMeals: Recipe[],
  persons: PersonsByGroup,
  mealType: 'mittag' | 'abend'
): AmpelReport => {
  const config: AmpelConfig = {
    mealTargetKcalPerPerson: MEAL_TARGETS[mealType],
    thresholds: { green: 0.10, yellow: 0.25 },
  };
  return computeMealAmpel(allMeals, persons, config);
};


// This function can be simplified as the main logic is now in the daily evaluation.
// It provides a quick hint for individual dishes in the selection modal.
export const evaluateDishInContext = (
  dish: Partial<Recipe>, 
  _dayPlan: Recipe[]
): DishEvaluationResult => {
  const reasons: string[] = [];
  let points = 0;
  
  const needsMoreProtein = false; // Day-level logic decides.
  const protein = proteinFromNutrition(dish);
  const kcal = kcalFromNutrition(dish);

  if (protein > 20) {
    points += 2;
    reasons.push('Gute Proteinquelle');
  } 
  
  if ((dish as any).isVollkorn) {
      points += 1;
      reasons.push('Enthält Vollkorn');
  }
  
  let score: 'good' | 'average' | 'bad' | 'neutral' = 'neutral';
  if (points >= 3) score = 'good';
  else if (points >= 1) score = 'average';

  return { 
      score, 
      reasons: reasons.length > 0 ? reasons : ['Standardgericht'],
      needsMoreProtein,
      totalCalories: kcal,
  };
};