import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { RecipeDatabase, Recipe, MittagessenCategory, AbendessenCategory } from '../../hooks/useRecipes';
import { getSeason, formatDate, getWeekNumber } from '../../utils/dateHelpers';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { evaluateDishInContext } from '../../rules/nutritionRules';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useMenuHistory } from '../../hooks/useMenuHistory';

// Enhanced nutritional indicators
const NutritionalBadges: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
  const badges = [];
  
  if (recipe.nutrition?.protein > 20) badges.push({ label: 'P+', color: 'blue', title: 'Proteinreich' });
  if (recipe.nutrition?.fiber > 5) badges.push({ label: 'B+', color: 'green', title: 'Ballaststoffreich' });
  if (recipe.nutrition?.sodium < 500) badges.push({ label: 'Na-', color: 'purple', title: 'Natriumarm' });
  if (recipe.nutrition?.sugar < 10) badges.push({ label: 'Z-', color: 'orange', title: 'Zuckerreduziert' });
  
  return (
    <div className="flex gap-1">
      {badges.map((badge, i) => (
        <span 
          key={i}
          title={badge.title}
          className={`text-xs bg-${badge.color}-100 text-${badge.color}-700 px-1.5 py-0.5 rounded-full font-medium`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
};

// Traffic light with enhanced context
const SmartTrafficLight: React.FC<{ 
  score: 'good' | 'average' | 'bad' | 'neutral',
  reasons?: string[] 
}> = ({ score, reasons }) => {
  const scoreMap = {
    good: { class: 'bg-green-500', icon: '✓' },
    average: { class: 'bg-yellow-500', icon: '!' },
    bad: { class: 'bg-red-500', icon: '✗' },
    neutral: { class: 'bg-gray-400', icon: '–' }
  };
  
  const config = scoreMap[score];
  
  return (
    <div className="relative group">
      <div className={clsx(
        'w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold',
        config.class
      )}>
        {config.icon}
      </div>
      {reasons && reasons.length > 0 && (
        <div className="absolute z-10 invisible group-hover:visible bg-slate-800 text-white text-xs rounded-lg p-2 w-48 -top-2 left-8">
          {reasons.map((reason, i) => (
            <div key={i}>• {reason}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// Suggestion quality validator
const validateSuggestionQuality = (suggestion: string, context: any) => {
  const issues = [];
  const warnings = [];
  
  const complexTerms = ['flambiert', 'gratiniert', 'sautiert', 'karamellisiert'];
  if (complexTerms.some(term => suggestion.toLowerCase().includes(term))) {
    warnings.push('Möglicherweise zu aufwändige Zubereitung');
  }
  
  const problematicIngredients = [
    { term: 'nüsse', issue: 'Allergen: Nüsse' },
    { term: 'meeresfrüchte', issue: 'Allergen: Meeresfrüchte' },
    { term: 'alkohol', issue: 'Enthält Alkohol' },
    { term: 'scharf', issue: 'Scharf gewürzt' },
    { term: 'roh', issue: 'Rohe Zutaten' }
  ];
  
  problematicIngredients.forEach(({ term, issue }) => {
    if (suggestion.toLowerCase().includes(term)) {
      issues.push(issue);
    }
  });
  
  const hardTextures = ['knusprig', 'kross', 'knackig', 'hart'];
  if (hardTextures.some(term => suggestion.toLowerCase().includes(term))) {
    warnings.push('Textur möglicherweise problematisch');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    score: issues.length === 0 ? (warnings.length === 0 ? 'good' : 'average') : 'bad'
  };
};

interface SelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selection: string) => void;
  target: any;
  menuData: any;
  currentDate: Date;
  recipes: RecipeDatabase;
  recipeMap: Map<string, Recipe>;
}

export const SelectionModal: React.FC<SelectionModalProps> = ({ 
  isOpen, 
  onClose, 
  onApply, 
  target, 
  menuData, 
  currentDate, 
  recipes, 
  recipeMap 
}) => {
  const [suggestions, setSuggestions] = useState<Array<{
    name: string;
    validation: ReturnType<typeof validateSuggestionQuality>;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [generationAttempts, setGenerationAttempts] = useState(0);
  
  const { preferences, trackSelection } = useUserPreferences();
  const { getRecentMeals, getMealFrequency } = useMenuHistory();
  
  const suggestionCache = useRef(new Map());
  
  const vegetarianRecipeNames = useMemo(() => {
    if (!recipes) return new Set();
    const names = new Set<string>();
    (recipes.mittagessen.vegi || []).forEach(recipe => names.add(recipe.name));
    (recipes.abendessen.vegi || []).forEach(recipe => names.add(recipe.name));
    return names;
  }, [recipes]);
  
  const { dayPlan, weekPlan, nutritionalBalance } = useMemo(() => {
    if (!target || !menuData) return { dayPlan: [], weekPlan: [], nutritionalBalance: {} };
    
    const dayData = menuData[target.day];
    const dayMeals = [
      ...(dayData?.mittag ? Object.values(dayData.mittag) : []),
      ...(dayData?.abend ? Object.values(dayData.abend) : [])
    ].map(name => recipeMap.get(name as string)).filter(Boolean) as Recipe[];
    
    const weekMeals: Recipe[] = [];
    Object.entries(menuData).forEach(([day, data]: [string, any]) => {
      if (day !== target.day) {
        const meals = [
          ...(data?.mittag ? Object.values(data.mittag) : []),
          ...(data?.abend ? Object.values(data.abend) : [])
        ].map(name => recipeMap.get(name as string)).filter(Boolean) as Recipe[];
        weekMeals.push(...meals);
      }
    });
    
    const balance = {
      totalProtein: dayMeals.reduce((sum, r) => sum + (r.nutrition?.protein || 0), 0),
      totalFiber: dayMeals.reduce((sum, r) => sum + (r.nutrition?.fiber || 0), 0),
      totalCalories: dayMeals.reduce((sum, r) => sum + (r.nutrition?.calories || 0), 0),
      needsMoreProtein: dayMeals.reduce((sum, r) => sum + (r.nutrition?.protein || 0), 0) < 60,
      needsMoreFiber: dayMeals.reduce((sum, r) => sum + (r.nutrition?.fiber || 0), 0) < 25
    };
    
    return { dayPlan: dayMeals, weekPlan: weekMeals, nutritionalBalance: balance };
  }, [target, menuData, recipeMap]);
  
  const { recipeCategoryList, categoryName } = useMemo(() => {
    if (!target || !recipes) return { recipeCategoryList: [], categoryName: '' };
    
    const { day, mealType, category } = target;
    let name = "Gericht";
    let list: Recipe[] = [];
    
    if (category.startsWith('wochenhitMittag')) {
      name = "Wochenhit Mittag";
      list = recipes.mittagessen.menu;
    } else if (category === 'wochenhitAbend') {
      name = "Wochenhit Abend";
      list = recipes.abendessen.menu;
    } else if (mealType === 'mittag') {
      const categoryMap: { [key: string]: string } = { 
        suppe: "Suppe", 
        dessert: "Dessert", 
        menu: "Hauptgang", 
        vegi: "Vegi-Hauptgang" 
      };
      name = categoryMap[category] || "Gericht";
      let dbCategoryKey = category as keyof MittagessenCategory;
      if (day === 'Freitag' && category === 'menu') {
        dbCategoryKey = 'fisch';
      }
      if (recipes.mittagessen && recipes.mittagessen[dbCategoryKey]) {
        list = recipes.mittagessen[dbCategoryKey];
      }
    } else if (mealType === 'abend') {
      const categoryMap: { [key: string]: string } = { 
        menu: "Abendessen", 
        vegi: "Vegi-Abendessen" 
      };
      name = categoryMap[category] || "Abendessen";
      const dbCategoryKey = category as keyof AbendessenCategory;
      if (recipes.abendessen && recipes.abendessen[dbCategoryKey]) {
        list = recipes.abendessen[dbCategoryKey];
      }
    }
    
    return { recipeCategoryList: list || [], categoryName: name };
  }, [target, recipes]);
  
  const filteredAndSortedItems = useMemo(() => {
    let filtered = recipeCategoryList.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    filtered.sort((a, b) => {
      const evalA = evaluateDishInContext(a, dayPlan);
      const evalB = evaluateDishInContext(b, dayPlan);
      const scoreMap = { good: 3, average: 2, bad: 1, neutral: 0 };
      const scoreDiff = scoreMap[evalB.score] - scoreMap[evalA.score];
      if (scoreDiff !== 0) return scoreDiff;
      
      const prefA = preferences[a.name] || 0;
      const prefB = preferences[b.name] || 0;
      if (prefB !== prefA) return prefB - prefA;
      
      const season = getSeason(currentDate);
      const seasonalA = a.tags?.includes(season) ? 1 : 0;
      const seasonalB = b.tags?.includes(season) ? 1 : 0;
      if (seasonalB !== seasonalA) return seasonalB - seasonalA;
      
      return a.name.localeCompare(b.name);
    });
    
    return filtered;
  }, [recipeCategoryList, searchTerm, dayPlan, preferences, currentDate]);
  
  const generateSuggestions = useCallback(async () => {
    if (!categoryName) {
      setError("Bitte wählen Sie eine Kategorie aus.");
      return;
    }
    
    const cacheKey = `${target.day}-${target.mealType}-${target.category}-${getWeekNumber(currentDate)}`;
    if (suggestionCache.current.has(cacheKey)) {
      const cached = suggestionCache.current.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5 min cache
        setSuggestions(cached.suggestions);
        return;
      }
    }
    
    try {
      setIsLoading(true);
      setError("");
      setGenerationAttempts(prev => prev + 1);
      
      const recentMeals = await getRecentMeals(7);
      const mealFrequency = await getMealFrequency();
      
      const promptObject = {
        role: "Erfahrener Küchenchef für Schweizer Altersheim mit Expertise in altersgerechter Ernährung",
        task: `Generiere ${target.mealType === 'mittag' ? '7-10' : '5-7'} kreative, abwechslungsreiche ${categoryName}-Vorschläge`,
        context: {
          category: categoryName,
          mealType: target.mealType,
          dayOfWeek: target.day,
          season: getSeason(currentDate),
          week: getWeekNumber(currentDate),
          existingDayMeals: dayPlan.map(r => r.name),
          existingWeekMeals: weekPlan.map(r => r.name).slice(0, 10),
          recentMeals: recentMeals.slice(0, 20),
          nutritionalNeeds: {
            needsProtein: nutritionalBalance.needsMoreProtein,
            needsFiber: nutritionalBalance.needsMoreFiber,
            currentCalories: nutritionalBalance.totalCalories
          },
          popularChoices: Object.entries(preferences)
            .sort(([,a], [,b]) => (b as number) - (a as number))
            .slice(0, 5)
            .map(([name]) => name),
          specialRequirements: target.day === 'Freitag' && target.mealType === 'mittag' ? 'Fisch-Tag' : null
        },
        rules: [
          "Gerichte müssen für ältere Menschen geeignet sein (Textur, Würzung, Portionsgröße)",
          "Berücksichtige mögliche Kau- und Schluckbeschwerden",
          "Keine Wiederholung von Gerichten der letzten 7 Tage",
          `Verwende saisonale Zutaten für ${getSeason(currentDate)}`,
          "Stelle ernährungsphysiologische Ausgewogenheit sicher",
          "30% der Vorschläge sollten regional/schweizerisch sein",
          "Variiere Zubereitungsarten und Hauptzutaten",
          "Beachte das Tagesmenü-Gleichgewicht",
          nutritionalBalance.needsMoreProtein ? "Fokus auf proteinreiche Optionen" : "",
          nutritionalBalance.needsMoreFiber ? "Fokus auf ballaststoffreiche Optionen" : "",
          "Keine problematischen Zeichen oder Backslashes verwenden"
        ].filter(Boolean),
        examples: recipeCategoryList.slice(0, 3).map(r => r.name)
      };
      
      // Response logic would go here, calling the new serverless function
      // For now, this is just the setup. The actual fetch call needs to be implemented.

    } catch (err) {
      console.error("Error setting up suggestion generation:", err);
      setError("Fehler bei der Vorbereitung der Vorschläge.");
    } finally {
      setIsLoading(false);
    }
  }, [categoryName, target, currentDate, dayPlan, weekPlan, nutritionalBalance, preferences, getRecentMeals, getMealFrequency, recipeCategoryList]);

  // ... rest of the component
};
