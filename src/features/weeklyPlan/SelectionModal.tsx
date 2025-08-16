import React, { useState, useMemo, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { Type } from '@google/genai';
import { Recipe } from '../../domain/types';
import { getSeason, getWeekNumber } from '../../utils/dateHelpers';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { evaluateDishInContext } from '../../rules/nutritionRules';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { getCache, setCache } from '../../utils/cacheManager';

const SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    <div className="relative group flex-shrink-0">
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


interface SelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selection: string) => void;
  target: any;
  menuData: any;
  currentDate: Date;
  recipes: Recipe[];
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const { preferences, trackSelection } = useUserPreferences();
  
  const { dayPlan, weekPlan } = useMemo(() => {
    if (!target || !menuData) return { dayPlan: [], weekPlan: [] };
    
    const getRecipesFromIds = (ids: (string | null | undefined)[]): Recipe[] => 
        ids.map(id => recipeMap.get(id || '')).filter(Boolean) as Recipe[];

    const dayData = menuData[target.day];
    const dayMealIds = [
      ...(dayData?.mittag ? Object.values(dayData.mittag) as string[] : []),
      ...(dayData?.abend ? Object.values(dayData.abend) as string[] : [])
    ];
    const dayRecipes = getRecipesFromIds(dayMealIds);

    const weekMealIds: string[] = [];
    Object.values(menuData).forEach((data: any) => {
        if (data && typeof data === 'object') {
            const meals = [
                ...(data?.mittag ? Object.values(data.mittag) : []),
                ...(data?.abend ? Object.values(data.abend) : [])
            ];
            weekMealIds.push(...(meals as string[]));
        }
    });
    const weekRecipes = getRecipesFromIds(weekMealIds);
    
    return { dayPlan: dayRecipes, weekPlan: weekRecipes };
  }, [target, menuData, recipeMap]);
  
  const { recipeCategoryList, categoryName } = useMemo(() => {
    if (!target || !recipes) return { recipeCategoryList: [], categoryName: '' };
    
    const { day, mealType, category } = target;
    let list: Recipe[] = [];
    let name = "Gericht";

    if (category.startsWith('wochenhitMittag')) {
        name = "Wochenhit Mittag";
        list = recipes.filter(r => ['fleisch', 'fisch', 'vegi'].includes(r.sourceCategory));
    } else if (category === 'wochenhitAbend') {
        name = "Wochenhit Abend";
        list = recipes.filter(r => r.sourceCategory === 'abend-menu' || r.sourceCategory === 'abend-vegi');
    } else if (mealType === 'mittag') {
        if (category === 'suppe') {
            list = recipes.filter(r => r.sourceCategory === 'suppe');
            name = 'Suppe';
        } else if (category === 'dessert') {
            list = recipes.filter(r => r.sourceCategory === 'dessert');
            name = 'Dessert';
        } else if (category === 'menu') {
            name = 'Hauptgang';
            if (day === 'Freitag') {
                list = recipes.filter(r => r.sourceCategory === 'fisch');
            } else {
                list = recipes.filter(r => r.sourceCategory === 'fleisch');
            }
        } else if (category === 'vegi') {
            name = 'Vegi-Hauptgang';
            list = recipes.filter(r => r.sourceCategory === 'vegi');
        }
    } else if (mealType === 'abend') {
        if (category === 'menu') {
            name = "Abendessen";
            list = recipes.filter(r => r.sourceCategory === 'abend-menu');
        } else if (category === 'vegi') {
            name = "Vegi-Abendessen";
            list = recipes.filter(r => r.sourceCategory === 'abend-vegi');
        }
    }
    
    return { recipeCategoryList: list || [], categoryName: name };
}, [target, recipes]);

    const byName = useMemo(() => new Map(recipes.map(r => [r.name, r])), [recipes]);

  const filteredAndSortedItems = useMemo(() => {
    let filtered = recipeCategoryList.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const weekPlanSet = new Set(weekPlan.map(r => r.recipeId));

    filtered.sort((a, b) => {
        const inWeekA = weekPlanSet.has(a.recipeId);
        const inWeekB = weekPlanSet.has(b.recipeId);
        if (inWeekA !== inWeekB) return inWeekA ? 1 : -1;

        const evalA = evaluateDishInContext(a, dayPlan);
        const evalB = evaluateDishInContext(b, dayPlan);
        const scoreMap = { good: 3, average: 2, neutral: 1, bad: 0 };
        const scoreDiff = (scoreMap[evalB.score] || 1) - (scoreMap[evalA.score] || 1);
        if (scoreDiff !== 0) return scoreDiff;
        
        const prefA = preferences[a.recipeId] || 0;
        const prefB = preferences[b.recipeId] || 0;
        if (prefB !== prefA) return prefB - prefA;

        return a.name.localeCompare(b.name);
    });
    
    return filtered;
  }, [recipeCategoryList, searchTerm, dayPlan, weekPlan, preferences]);

  const cacheKey = useMemo(() => `suggestions::${getWeekNumber(currentDate)}::${categoryName || "general"}`, [currentDate, categoryName]);
  
  const generateSuggestions = useCallback(async () => {
    if (!categoryName) { setError("Bitte zuerst eine Kategorie auswählen."); return; }
    setIsLoading(true);
    setError("");

    const cached = getCache<string[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setSuggestions(cached); setIsLoading(false); return;
    }
    
    const existing = Array.from(new Set([
        ...weekPlan.map(r => r.name),
        ...dayPlan.map(r => r.name)
    ]));

    const userPrompt = `
      **Context:**
      - Category: ${categoryName}
      - Season: ${getSeason(currentDate)}
      - Existing items this week (avoid these): ${existing.join(', ') || 'None'}
      - Number of suggestions needed: 10
      
      **Available Recipes:**
      ${recipeCategoryList.map(r => r.name).join(', ')}

      Please generate 10 diverse suggestions for the category "${categoryName}".
    `;

    try {
        const schema = {
            type: Type.OBJECT,
            properties: {
                suggestions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        };

        const response = await fetch('/.netlify/functions/generate-enhanced', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                promptString: userPrompt, 
                schema,
                existingItems: existing, 
                maxSuggestions: 10,
            }),
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success || !result.data?.suggestions) {
            const errorDetails = result.error ? `${result.error.stage}: ${result.error.message}` : 'No suggestions returned from function.';
            throw new Error(errorDetails);
        }

        const list = result.data.suggestions;
      
      const existingIds = new Set<string>([
        ...weekPlan.map(r => r.recipeId),
        ...dayPlan.map(r => r.recipeId),
      ]);

      const uniqueSuggestions = Array.from(new Set(list))
        .filter((s): s is string => typeof s === 'string');

      const mappedIds = uniqueSuggestions
        .map(s => byName.get(s))
        .filter(Boolean)
        .map(r => (r as Recipe).recipeId)
        .filter(id => !existingIds.has(id));

      setSuggestions(mappedIds.slice(0, 10));
      setCache(cacheKey, mappedIds, SUGGESTION_TTL_MS);

    } catch (e: any) {
      setError(e?.message || "Fehler bei der Generierung.");
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, categoryName, dayPlan, weekPlan, currentDate, recipeMap, byName, recipeCategoryList]);

  const handleSelection = useCallback((selectionId: string, source: 'database' | 'ai') => {
    trackSelection(selectionId, target.category, source);
    onApply(selectionId);
  }, [trackSelection, target, onApply]);
  
  useEffect(() => {
    if (isOpen) { setSearchTerm(''); setSuggestions([]); setError(''); setIsLoading(false); }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const weekPlanSet = new Set(weekPlan.map(r => r.recipeId));
  const isInWeek = (rid: string) => weekPlanSet.has(rid);
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-slate-800">Auswahl für: {categoryName}</h3>
          <div className="flex gap-4 mt-2 text-sm text-slate-600">
            <span>Saison: {getSeason(currentDate)}</span>
            <span>Woche: {getWeekNumber(currentDate)}</span>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6 flex-1 overflow-hidden">
          <div className="flex flex-col min-h-0">
            <h4 className="font-semibold text-slate-700 mb-2">Aus Datenbank ({filteredAndSortedItems.length})</h4>
            <input type="text" placeholder="Suchen..." className="w-full p-2 border border-slate-300 rounded-md mb-3" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/50 p-1">
              {filteredAndSortedItems.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {filteredAndSortedItems.map((item) => {
                    const evaluation = evaluateDishInContext(item, dayPlan);
                    const isVegetarian = item.sourceCategory === 'vegi' || item.sourceCategory === 'abend-vegi';
                    const isPopular = (preferences[item.recipeId] || 0) > 3;

                    return (
                        <li key={item.recipeId} className={clsx("p-2 hover:bg-slate-100 flex justify-between items-center", { "opacity-60": isInWeek(item.recipeId) })}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <SmartTrafficLight score={evaluation.score} reasons={evaluation.reasons} />
                                <span className="truncate" title={item.name}>{item.name}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                {isVegetarian && <span className="badge badge-vegi">Vegi</span>}
                                {isPopular && <span className="badge badge-popular">Beliebt</span>}
                                {isInWeek(item.recipeId) && <span className="badge badge-in-week">Diese Woche</span>}
                                <button onClick={() => handleSelection(item.recipeId, 'database')} className="text-sm px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" disabled={isInWeek(item.recipeId)}>
                                  Wählen
                                </button>
                            </div>
                        </li>
                    );
                  })}
                </ul>
              ) : <p className="p-4 text-sm text-slate-500 text-center">Keine Einträge gefunden.</p>}
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-slate-700">KI-Vorschläge</h4>
                <button className="text-sm px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60" onClick={generateSuggestions} disabled={isLoading}>
                    {isLoading ? <span className="inline-flex gap-2 items-center"><LoadingSpinner size="small" overlay={false}/> Generiere...</span> : "Neue Ideen"}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/50 p-1 relative">
                {error && <div className="p-3 mb-2 text-sm rounded bg-red-50 text-red-700 border border-red-200">{error}</div>}
                {!error && !isLoading && suggestions.length === 0 && (
                    <div className="p-8 text-center text-slate-600"><div className="text-4xl mb-3">💡</div><p className="text-sm">Klicken Sie auf "Neue Ideen" für Vorschläge.</p></div>
                )}
                {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg"><LoadingSpinner overlay={false} /></div>}
                {!isLoading && suggestions.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {suggestions.map((suggestionId, idx) => {
                            const hit = recipeMap.get(suggestionId);
                            if (!hit) return null;
                            const evalResult = evaluateDishInContext(hit, dayPlan) || { score: "neutral", reasons: [] };
                            
                            return <li key={`${suggestionId}-${idx}`} className="p-2 flex items-start justify-between gap-3 hover:bg-slate-100"><div className="flex-1 flex items-center gap-2"><SmartTrafficLight score={evalResult.score} reasons={evalResult.reasons}/><span className="text-sm">{hit.name}</span></div><button onClick={() => handleSelection(suggestionId, 'ai')} className="self-center text-sm px-3 py-1 rounded bg-slate-200 hover:bg-slate-300">Wählen</button></li>;
                        })}
                    </ul>
                )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="bg-slate-200 text-slate-700 font-semibold px-6 py-2.5 rounded-lg hover:bg-slate-300" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
};
