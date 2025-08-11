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
      
      const responseSchema = {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: { 
              type: "string",
              minLength: 3,
              maxLength: 100
            },
            minItems: 5,
            maxItems: 10
          }
        },
        required: ["suggestions"]
      };
      
      const res = await fetch('/.netlify/functions/generate-enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          promptObject: promptObject,
          schema: responseSchema,
          existingItems: [...recipeCategoryList.map(r => r.name), ...recentMeals],
          useCache: generationAttempts === 1,
          modelPreference: generationAttempts > 2 ? 'PRO' : 'FAST'
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Netzwerk-Antwort war nicht OK');
      }
      
      const data = await res.json();
      
      let parsedSuggestions = [];
      try {
        const parsed = JSON.parse(data.text);
        parsedSuggestions = parsed.suggestions || parsed;
      } catch (e) {
        console.error("Error parsing suggestions:", e);
        throw new Error("Fehler beim Verarbeiten der Vorschläge");
      }
      
      const validatedSuggestions = parsedSuggestions.map(suggestion => ({
        name: suggestion,
        validation: validateSuggestionQuality(suggestion, {
          category: categoryName,
          mealType: target.mealType
        })
      }));
      
      const validSuggestions = validatedSuggestions.filter(s => s.validation.isValid);
      
      if (validSuggestions.length < 3 && generationAttempts < 3) {
        console.log(`Nur ${validSuggestions.length} gültige Vorschläge, versuche erneut...`);
        return generateSuggestions();
      }
      
      suggestionCache.current.set(cacheKey, {
        suggestions: validatedSuggestions,
        timestamp: Date.now()
      });
      
      setSuggestions(validatedSuggestions);
      
    } catch (err) {
      console.error("Error generating suggestions:", err);
      setError(`Fehler bei der Generierung: ${(err as Error).message}`);
      
      if (generationAttempts < 2) {
        setTimeout(() => generateSuggestions(), 2000);
      }
    } finally {
      setIsLoading(false);
    }
  }, [categoryName, target, dayPlan, weekPlan, nutritionalBalance, recipeCategoryList, currentDate, preferences, generationAttempts, getRecentMeals]);
  
  const handleSelection = useCallback((selection: string, source: 'database' | 'ai') => {
    trackSelection(selection, target.category, source);
    onApply(selection);
  }, [trackSelection, target, onApply]);
  
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSuggestions([]);
      setError('');
      setIsLoading(false);
      setGenerationAttempts(0);
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-slate-800">
            {categoryName} für {target?.day} {target?.mealType === 'mittag' ? 'Mittag' : 'Abend'} auswählen
          </h3>
          <div className="flex gap-4 mt-2 text-sm text-slate-600">
            <span>Saison: {getSeason(currentDate)}</span>
            <span>Woche: {getWeekNumber(currentDate)}</span>
            {nutritionalBalance.needsMoreProtein && (
              <span className="text-blue-600 font-medium">↑ Protein empfohlen</span>
            )}
            {nutritionalBalance.needsMoreFiber && (
              <span className="text-green-600 font-medium">↑ Ballaststoffe empfohlen</span>
            )}
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6 flex-1 overflow-y-hidden">
          <div className="flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-slate-700">Aus Datenbank</h4>
              <span className="text-xs text-slate-500">{filteredAndSortedItems.length} Optionen</span>
            </div>
            
            <input 
              type="text" 
              placeholder="Suchen..." 
              className="w-full p-2 border border-slate-300 rounded-md mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/50">
              {filteredAndSortedItems.length > 0 ? (
                filteredAndSortedItems.map((item, i) => {
                  const evaluation = evaluateDishInContext(item, dayPlan);
                  const isVegetarian = vegetarianRecipeNames.has(item.name);
                  const frequency = getMealFrequency()[item.name] || 0;
                  const isPopular = frequency > 5;
                  const recentlyUsed = weekPlan.some(r => r.name === item.name);
                  
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelection(item.name, 'database')}
                      disabled={recentlyUsed}
                      className={clsx(
                        "w-full text-left p-3 transition-all border-b border-slate-100",
                        recentlyUsed ? "opacity-50 bg-slate-100 cursor-not-allowed" : "hover:bg-blue-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          <SmartTrafficLight 
                            score={evaluation.score} 
                            reasons={evaluation.reasons}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.description && (
                              <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <NutritionalBadges recipe={item} />
                          
                          {isVegetarian && (
                            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              Vegi
                            </span>
                          )}
                          
                          {isPopular && (
                            <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                              Beliebt
                            </span>
                          )}
                          
                          {recentlyUsed && (
                            <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                              Diese Woche
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="p-4 text-sm text-slate-500 text-center">
                  Keine Einträge gefunden. Versuchen Sie einen anderen Suchbegriff.
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-slate-700">KI-Vorschläge</h4>
              {suggestions.length > 0 && (
                <span className="text-xs text-slate-500">{suggestions.length} Ideen</span>
              )}
            </div>
            
            <button
              onClick={generateSuggestions}
              disabled={isLoading}
              className={clsx(
                "w-full mb-3 flex justify-center items-center gap-2 font-semibold px-4 py-2.5 rounded-lg transition-all",
                isLoading 
                  ? "bg-blue-300 text-white cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg"
              )}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="small" />
                  <span>Generiere kreative Ideen...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Neue Ideen generieren</span>
                  {generationAttempts > 0 && <span className="text-xs">({generationAttempts})</span>}
                </>
              )}
            </button>
            
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg relative bg-slate-50/50">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                  <div className="text-center">
                    <LoadingSpinner />
                    <p className="text-sm text-slate-600 mt-2">Erstelle personalisierte Vorschläge...</p>
                  </div>
                </div>
              )}
              
              {error && (
                <div className="p-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{error}</p>
                    {generationAttempts < 3 && (
                      <button
                        onClick={generateSuggestions}
                        className="mt-2 text-xs text-red-700 underline hover:no-underline"
                      >
                        Erneut versuchen
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {suggestions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {suggestions.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelection(item.name, 'ai')}
                      className="w-full text-left p-3 hover:bg-blue-50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          <SmartTrafficLight 
                            score={item.validation.score} 
                            reasons={[...item.validation.issues, ...item.validation.warnings]}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.validation.warnings.length > 0 && (
                              <div className="text-xs text-amber-600 mt-0.5">
                                ⚠ {item.validation.warnings[0]}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                          KI-Idee
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : !isLoading && !error && (
                <div className="p-8 text-center">
                  <div className="text-4xl mb-3">💡</div>
                  <p className="text-sm text-slate-600">
                    Klicken Sie auf "Neue Ideen generieren" für kreative,
                    <br />personalisierte Menüvorschläge basierend auf Ihrem Kontext.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-between items-center">
          <div className="text-xs text-slate-500">
            {generationAttempts > 0 && (
              <span>Model: {generationAttempts > 2 ? 'Gemini Pro' : 'Gemini Flash'}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="bg-slate-200 text-slate-700 font-semibold px-6 py-2.5 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
