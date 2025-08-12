import { Recipe, PersonsByGroup, AmpelConfig, Nutrition } from './types';

export interface AmpelReport {
  kcalMeal: number;
  targetMeal: number;
  ratio: number;
  deviationPct: number;
  color: 'green' | 'yellow' | 'red' | 'neutral';
  notes: {type: 'warning' | 'suggestion', text: string}[];
}

export function kcalForPortionG(n: Nutrition, portionG: number, fallbackBaseG?: number): number {
  if (n.kind === "PER_100G") {
    return (portionG / 100) * n.kcalPer100g;
  }
  const base = n.basePortionG || fallbackBaseG || portionG;
  if (base === 0) return 0;
  return n.kcalPerPortion * (portionG / base);
}

export function recipeTotalKcal(recipe: Recipe, persons: PersonsByGroup): { totalKcal: number, warnings: string[] } {
  const baseG = recipe.portion.basePortionG;
  let sum = 0;
  const warnings: string[] = [];

  for (const group in persons) {
    const personCount = persons[group] || 0;
    const portionG = recipe.portion.portionGByGroup[group];
    
    if (portionG === undefined) {
        warnings.push(`"${recipe.name}" nutzt Standardportion für Gruppe "${group}".`);
    }

    sum += personCount * kcalForPortionG(recipe.nutrition, portionG ?? baseG, baseG);
  }
  return { totalKcal: sum, warnings };
}

export function computeMealAmpel(recipes: Recipe[], persons: PersonsByGroup, cfg: AmpelConfig): AmpelReport {
  if (recipes.length === 0) {
      return { kcalMeal: 0, targetMeal: 0, ratio: 1, deviationPct: 0, color: 'neutral', notes: [] };
  }
  
  const allWarnings = new Set<string>();
  const kcalMeal = recipes.reduce((acc, r) => {
      const { totalKcal, warnings } = recipeTotalKcal(r, persons);
      warnings.forEach(w => allWarnings.add(w));
      return acc + totalKcal;
  }, 0);

  const totalPersons = Object.values(persons).reduce((a, b) => a + b, 0);

  if (totalPersons === 0) {
      return { kcalMeal: 0, targetMeal: 0, ratio: 1, deviationPct: 0, color: 'neutral', notes: [] };
  }

  const kcalMealPerPerson = kcalMeal / totalPersons;
  const target = cfg.mealTargetKcalPerPerson;
  const ratio = target > 0 ? kcalMealPerPerson / target : 1;
  const dev = Math.abs(1 - ratio);
  
  const color = dev <= cfg.thresholds.green ? "green" : dev <= cfg.thresholds.yellow ? "yellow" : "red";
  
  const notes: {type: 'warning' | 'suggestion', text: string}[] = [];
  if (color === 'red') notes.push({type: 'warning', text: 'Kalorienziel stark verfehlt.'});
  else if (color === 'yellow') notes.push({type: 'warning', text: 'Kalorienziel leicht verfehlt.'});
  else notes.push({type: 'suggestion', text: 'Kalorienziel gut erreicht.'});
  
  allWarnings.forEach(w => notes.push({ type: 'warning', text: w }));

  return { 
      kcalMeal: kcalMealPerPerson, 
      targetMeal: target, 
      ratio, 
      deviationPct: (ratio - 1) * 100,
      color,
      notes
  };
}