import React, { useState } from 'react';
import { getWeekNumber, getSeason } from '../../utils/dateHelpers';
import { Recipe } from '../../domain/types';
import { getCache, setCache } from '../../utils/cacheManager';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { cleanJsonResponse, attemptJsonFix } from '../../utils/jsonSanitizer';

/* ---- TYPES ---- */
interface WeeklyPlanSuggestionProps {
  currentDate: Date;
  handleUpdateData: (path: (string | number)[], value: any) => void;
  recipes: Recipe[];
}

interface DayPlan {
  mittag: { suppe: string; dessert: string; menu: string; vegi: string };
  abend: { menu: string; vegi: string };
}

type IdealPlan = Record<string, DayPlan>;

/* ---- CONSTANTS & HELPERS ---- */
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
const MEAL_TYPES = {
  mittag: ['suppe', 'dessert', 'menu', 'vegi'] as const,
  abend: ['menu', 'vegi'] as const,
};
const HEADER_LABELS: Record<string, string> = {
  suppe: 'Suppe',
  menu: 'Menu',
  vegi: 'Vegi',
  dessert: 'Dessert',
};
const SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000;

/* ---- COMPONENT ---- */
export const WeeklyPlanSuggestion: React.FC<WeeklyPlanSuggestionProps> = ({
  currentDate,
  handleUpdateData,
  recipes,
}) => {
  const [idealPlan, setIdealPlan] = useState<Partial<IdealPlan> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const generatePlan = async () => {
    setIsLoading(true);
    setError('');
    setIdealPlan(null);

    const cacheKey = `weekly-plan-suggestion-${getWeekNumber(currentDate)}-${currentDate.getFullYear()}`;
    
    const cachedPlan = getCache<IdealPlan>(cacheKey);
    if (cachedPlan) {
      setIdealPlan(cachedPlan);
      setIsLoading(false);
      return;
    }

    try {
        const response = await fetch('/.netlify/functions/generate-weekly-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: currentDate, recipes }),
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        
        const result = await response.json();

        if (!result.success || !result.data?.plan) {
            const errorDetails = result.error ? `${result.error.stage}: ${result.error.message}` : 'No plan returned from function.';
            throw new Error(`Plan generation failed: ${errorDetails}`);
        }
        
        const plan = result.data.plan;
        
        if (!plan || !DAYS.every(day => plan[day]?.mittag && plan[day]?.abend)) {
             throw new Error("AI returned an incomplete plan.");
        }

        setIdealPlan(plan);
        setCache(cacheKey, plan, SUGGESTION_TTL_MS);

    } catch (err) {
      console.error("Error generating plan:", err);
      setError(`Plan konnte nicht vollständig generiert werden. Fehler: ${(err as Error).message}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const applyMeal = (day: string, mealType: keyof typeof MEAL_TYPES, category: string) => {
      const mealName = (idealPlan as any)?.[day]?.[mealType]?.[category];
      if (mealName) {
          handleUpdateData([day, mealType, category], mealName);
      }
  };

  const applyDay = (day: string) => {
    if (!idealPlan?.[day as keyof IdealPlan]) return;
    for (const mealType of Object.keys(MEAL_TYPES) as (keyof typeof MEAL_TYPES)[]) {
        for (const category of MEAL_TYPES[mealType]) {
            applyMeal(day, mealType, category as string);
        }
    }
  };

  const applyFullPlan = () => {
    if (!idealPlan) return;
    DAYS.forEach(day => {
        if (idealPlan[day]) {
            applyDay(day);
        }
    });
  };

  return (
    <div className="mb-8 p-6 bg-white rounded-xl shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ideale Wochenplanung</h2>
          <p className="text-sm text-slate-500">Basierend auf dem CURAVIVA-Leitfaden für gesunde Ernährung im Alter.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generatePlan}
            disabled={isLoading}
            className="bg-white border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isLoading ? <LoadingSpinner size="small" overlay={false} /> : null}
            {isLoading ? 'Wird generiert...' : 'Neue Empfehlung'}
          </button>
          {idealPlan && Object.keys(idealPlan).length === 7 && (
            <button
              onClick={applyFullPlan}
              className="bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-2"
            >
              Alles übernehmen
            </button>
          )}
        </div>
      </div>

      {isLoading && <div className="text-center p-8"><LoadingSpinner overlay={false} /></div>}
      {error && <div className="text-center p-4 my-4 bg-red-100 text-red-700 rounded-lg">Fehler bei der Plangenerierung: <br/>{error}</div>}

      {idealPlan && Object.keys(idealPlan).length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse border border-slate-200">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th rowSpan={2} className="p-3 font-semibold text-left border-b border-r align-bottom">Tag</th>
                <th colSpan={4} className="p-3 font-semibold text-center border-b">Mittagessen</th>
                <th colSpan={2} className="p-3 font-semibold text-center border-b border-l">Abendessen</th>
                <th rowSpan={2} className="p-3 font-semibold text-center border-b border-l align-bottom">Aktion</th>
              </tr>
              <tr>
                {MEAL_TYPES.mittag.map(c => <th key={`h-m-${c}`} className="p-2 font-medium text-center border-b">{HEADER_LABELS[c]}</th>)}
                {MEAL_TYPES.abend.map(c => <th key={`h-a-${c}`} className="p-2 font-medium text-center border-b border-l">{HEADER_LABELS[c]}</th>)}
              </tr>
            </thead>
            <tbody className="bg-white">
              {DAYS.map(day => (
                <tr key={day} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold border-r">{day}</td>
                  {MEAL_TYPES.mittag.map(c => (
                    <td key={`c-m-${c}`} className="p-3 text-slate-700 hover:bg-blue-50 cursor-pointer" onClick={() => idealPlan?.[day] && applyMeal(day, 'mittag', c as string)}>
                      {idealPlan[day]?.mittag?.[c] ?? ''}
                    </td>
                  ))}
                  {MEAL_TYPES.abend.map(c => (
                    <td key={`c-a-${c}`} className="p-3 text-slate-700 hover:bg-blue-50 cursor-pointer border-l" onClick={() => idealPlan?.[day] && applyMeal(day, 'abend', c as string)}>
                      {idealPlan[day]?.abend?.[c] ?? ''}
                    </td>
                  ))}
                  <td className="p-3 text-center border-l">
                    <button onClick={() => idealPlan?.[day] && applyDay(day)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold px-3 py-1 rounded-md text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" disabled={!idealPlan?.[day]}>
                      Tag übernehmen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
