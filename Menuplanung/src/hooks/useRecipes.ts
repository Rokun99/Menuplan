// src/hooks/useRecipes.ts
import { useState, useEffect } from 'react';

/* ---------- Typen ---------- */
export interface Ingredient {
  name: string;
  grams: number;
  category: string;
}

export interface Recipe {
  name: string;
  allergens: string[];
  kcal: number;
  protein: number;
  fat: number;
  foodGroup:
    | 'protein'
    | 'dairy'
    | 'vegetable'
    | 'fruit'
    | 'starch'
    | 'fat_oil';
  isVollkorn: boolean;
  ingredients: Ingredient[];
}

export type MittagessenCategory = {
  suppe: Recipe[];
  dessert: Recipe[];
  menu: Recipe[];
  fisch: Recipe[];
  vegi: Recipe[];
};

export type AbendessenCategory = {
  menu: Recipe[];
  fisch: Recipe[];
  vegi: Recipe[];
};

export interface RecipeDatabase {
  mittagessen: MittagessenCategory;
  abendessen: AbendessenCategory;
}

/* ---------- Konfiguration ---------- */
const RECIPE_MAP: Record<keyof MittagessenCategory, string> = {
  suppe:   '/Suppe.json',
  dessert: '/Dessert.json',
  menu:    '/Fleischgerichte.json',
  fisch:   '/Fisch.json',
  vegi:    '/Vegetarisch.json',
};

const ABEND_MAP: Record<keyof AbendessenCategory, string> = {
  menu: '/abendessen.json',
  fisch: '/abendessen.json',
  vegi: '/abendessen.json',
};

/* ---------- Hook ---------- */
export const useRecipes = () => {
  const [recipes, setRecipes] = useState<RecipeDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecipes = async () => {
      try {
        /* 1. alle Dateien parallel laden */
        const mittagEntries = await Promise.all(
          Object.entries(RECIPE_MAP).map(async ([key, path]) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`${res.status} – ${path}`);
            const json = await res.json();
            // flexibler Key-Name aus JSON
            const dataKey = Object.keys(json)[0] || key;
            return [key, json[dataKey] as Recipe[]] as const;
          })
        );

        const abendEntries = await Promise.all(
          Object.entries(ABEND_MAP).map(async ([key, path]) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`${res.status} – ${path}`);
            const json = await res.json();
            const dataKey = key === 'fisch' ? 'fisch' : key === 'vegi' ? 'vegi' : 'menu';
            return [key, json.abendessen?.[dataKey] || json[dataKey] || []] as const;
          })
        );

        /* 2. Datenbank zusammenbauen */
        setRecipes({
          mittagessen: Object.fromEntries(mittagEntries) as MittagessenCategory,
          abendessen: Object.fromEntries(abendEntries) as AbendessenCategory,
        });

      } catch (err: any) {
        setError(err.message || 'Unbekannter Fehler');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipes();
  }, []);

  return { recipes, isLoading, error };
};