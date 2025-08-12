// types.ts

export type GroupKey = "erwachsene" | "senioren" | "kinder";
export type PersonsByGroup = Record<GroupKey, number>;

export type Nutrition =
  | { kind: "PER_100G"; kcalPer100g: number; proteinPer100g?: number; fatPer100g?: number; carbsPer100g?: number }
  | { kind: "PER_PORTION"; kcalPerPortion: number; proteinPerPortion?: number; fatPerPortion?: number; carbsPer100g?: number; basePortionG: number };

export interface PortionConfig {
  basePortionG: number;
  portionGByGroup: Record<GroupKey, number>;
}

export type Allergen =
  | "gluten" | "milk" | "egg" | "soy" | "nuts" | "peanuts" | "fish" | "crustaceans"
  | "celery" | "mustard" | "sesame" | "lupin" | "sulphites" | "molluscs";

export interface Ingredient {
  ingredientId: string;
  name: string;
  qtyPerBasePortionG: number; // The edible amount of this ingredient needed for the base portion size of the recipe
  yield?: number; // Factor between 0 and 1 (e.g., 0.9 means 10% waste)
  packSizeG?: number;
  categoryKey: "butchery"|"bakery"|"dairy"|"produce"|"dry_goods"|"frozen"|"seafood";
}

export type FoodGroup =
  | 'protein'
  | 'dairy'
  | 'vegetable'
  | 'fruit'
  | 'starch'
  | 'fat_oil'
  | 'dessert'
  | 'suppe';

export interface Recipe {
  recipeId: string;
  name: string;
  allergens: Allergen[];
  foodGroup: FoodGroup;
  isVollkorn: boolean;
  // Deprecated flat fields are removed to enforce canonical structure
  nutrition: Nutrition;
  portion: PortionConfig;
  ingredients: Ingredient[];
  sourceCategory: string; // e.g., 'suppe', 'fleisch', 'fisch', 'vegi', 'abend-menu', 'abend-vegi'
}

export interface AmpelConfig {
  mealTargetKcalPerPerson: number;
  thresholds: { green: number; yellow: number }; // e.g., {green:0.10, yellow:0.25}
}

export interface OrderLine {
  ingredientId: string;
  name: string;
  categoryKey: Ingredient['categoryKey'];
  netRequiredG: number;   // Edible amount (EP - Essensportion)
  grossRequiredG: number; // Purchase amount (AP - aufbereitete Portion, before pack rounding)
  packSizeG?: number;
  packs?: number;
  orderQtyG?: number;
}
