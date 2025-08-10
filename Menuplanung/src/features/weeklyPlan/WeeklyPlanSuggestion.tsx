import React, { useState } from 'react';
import { Type } from '@google/generative-ai';
import { getWeekNumber, getSeason } from '../../utils/dateHelpers';
import { RecipeDatabase, Recipe } from '../../hooks/useRecipes';

/* ---- TYPES ---- */
interface WeeklyPlanSuggestionProps {
  currentDate: Date;
  handleUpdateData: (path: (string | number)[], value: any) => void;
  recipes: RecipeDatabase;
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

// Gets a random, smaller sample from a recipe list to keep the prompt size manageable
const getSample = (list: Recipe[] | undefined, max = 15): Recipe[] => {
  if (!list || list.length === 0) return [];
  return [...list].sort(() => 0.5 - Math.random()).slice(0, max);
};

const createDailySchema = () => ({
    type: Type.OBJECT,
    required: ['mittag', 'abend'],
    properties: {
      mittag: {
        type: Type.OBJECT,
        required: ['suppe', 'dessert', 'menu', 'vegi'],
        properties: {
          suppe: { type: Type.STRING },
          dessert: { type: Type.STRING },
          menu: { type: Type.STRING },
          vegi: { type: Type.STRING },
        },
      },
      abend: {
        type: Type.OBJECT,
        required: ['menu', 'vegi'],
        properties: {
          menu: { type: Type.STRING },
          vegi: { type: Type.STRING },
        },
      },
    },
});

// ==================================================================
// HIER IST DIE WICHTIGSTE ÄNDERUNG: DER VERBESSERTE PROMPT
// ==================================================================
const createDailyPromptObject = (day: string, season: string, planSoFar: Partial<IdealPlan>, samples: any) => {
    // Sammelt ALLE bisher geplanten Gerichte, nicht nur die Hauptspeisen
    const allPreviouslyPlannedDishes = Object.values(planSoFar).flatMap(d => [
        d.mittag.suppe, d.mittag.dessert, d.mittag.menu, d.mittag.vegi,
        d.abend.menu, d.abend.vegi
    ]);

    const rules = [
      `**SAISONALITÄT:** Bevorzuge Gerichte, die zur Jahreszeit '${season}' passen.`,
      `**STRIKTE ABWECHSLUNG (WICHTIGSTE REGEL):** Wiederhole ABSOLUT KEIN Gericht, das bereits geplant wurde. Verbotene Gerichte sind: ${JSON.stringify(allPreviouslyPlannedDishes)}`,
      "**DATENBANK:** Nutze NUR Gerichte aus dem Rezept-Auszug. Wähle aus den korrekten Kategorien (z.B. `mittagessen.suppe` für die Suppe).",
      "**STRUKTUR:** Fülle IMMER alle Felder aus: mittag(suppe, dessert, menu, vegi) und abend(menu, vegi).",
      "**FLEISCH-LIMIT:** Plane max. 3-4 Fleischgerichte in der GANZEN Woche. Prüfe `planSoFar`.",
      "**VEGI-TAG:** EIN Tag der Woche muss ein Vegi-Tag sein (mittag.menu & abend.menu sind vegetarisch). Prüfe `planSoFar`. Wenn noch keiner gesetzt ist, KÖNNTE heute einer sein.",
      "**VEGI-ABENDESSEN-REGEL:** Wenn 'abend.menu' ein vegetarisches Gericht ist (d.h. aus 'abendessen.vegi' stammt), MUSS 'abend.vegi' exakt das gleiche Gericht sein."
    ];

    if (day === 'Freitag') {
      rules.push("**FISCH-FREITAG (STRIKT):** Das `mittag.menu` MUSS ein Fischgericht sein (aus `mittagessen.fisch`). Alle anderen Mahlzeiten heute dürfen KEINEN Fisch enthalten.");
    } else {
      rules.push("**KEIN FISCH:** An diesem Tag darf KEIN Fischgericht geplant werden. Fisch ist nur für Freitagmittag reserviert.");
    }
    
    return {
        role: "KI-Küchenchef für ein Schweizer Altersheim mit Fokus auf hohe Qualität und Abwechslung",
        task: "Erstelle den Menüplan für EINEN EINZELNEN Tag und befolge die Regeln strikt.",
        context: {
            day_to_plan: day,
            season: season,
            plan_so_far_this_week: planSoFar,
        },
        rules: rules,
        data_source_info: "Nutze NUR den folgenden Rezept-Auszug als Quelle.",
        data_source_sample: samples,
        output_format_instruction: `Generiere den **vollständigen** JSON-Plan NUR für den Tag **${day}**. Halte dich exakt an die Regeln. Das JSON muss valide sein und dem vorgegebenen Schema entsprechen.`
    };
};


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

    if (!recipes) {
      setError('Rezeptdatenbank konnte nicht geladen werden.');
      setIsLoading(false);
      return;
    }

    const samples = {
      mittagessen: {
        suppe: getSample(recipes.mittagessen.suppe, 10),
        dessert: getSample(recipes.mittagessen.dessert, 10),
        menu: getSample(recipes.mittagessen.menu, 15),
        vegi: getSample(recipes.mittagessen.vegi, 15),
        fisch: getSample(recipes.mittagessen.fisch, 8),
      },
      abendessen: {
        menu: getSample(recipes.abendessen.menu, 15),
        vegi: getSample(recipes.abendessen.vegi, 15),
      },
    };
    
    // DEBUGGING: Zeigt an, welche Rezepte der KI zur Verfügung stehen.
    console.log("Verfügbare Rezept-Samples für die KI:", samples);

    if (samples.mittagessen.fisch.length === 0) {
        setError('Keine Fischgerichte für die "Fisch-Freitag"-Regel gefunden.');
        setIsLoading(false);
        return;
    }
    
    const fullPlan: Partial<IdealPlan> = {};
    
    try {
      for (const day of DAYS) {
        const dailyPromptObject = createDailyPromptObject(day, getSeason(currentDate), fullPlan, samples);
        const dailySchema = createDailySchema();

        const res = await fetch('/.netlify/functions/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: dailyPromptObject, // Hier senden wir das ganze Objekt
                schema: dailySchema,
            }),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || `Fehler bei der Generierung für ${day} (${res.status})`);
        }
        
        const data = await res.json();
        // Versuch, die Antwort zu bereinigen, falls sie in Markdown-Codeblöcken eingeschlossen ist
        const cleanedText = data.text.replace(/```json\n?/, '').replace(/```$/, '').trim();
        const dayPlan: DayPlan = JSON.parse(cleanedText);

        if (!dayPlan.mittag || !dayPlan.abend || !dayPlan.mittag.menu) {
            throw new Error(`KI hat eine ungültige Struktur für ${day} generiert.`);
        }

        fullPlan[day] = dayPlan;
        setIdealPlan({ ...fullPlan }); // Update UI incrementally as plan is built
      }
    } catch (err) {
      console.error("Error generating plan:", err);
      const missingDays = DAYS.filter(d => !fullPlan[d]).join(', ');
      let errorMessage = `Plan konnte nicht vollständig generiert werden. Fehler: ${(err as Error).message}.`;
      if (missingDays) {
          errorMessage = `KI hat einen unvollständigen Plan generiert. Fehlende Tage: ${missingDays}`;
      }
      setError(errorMessage);
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
            {isLoading && <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>}
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

      {isLoading && !idealPlan && <div className="text-center p-8"><div className="loading-spinner inline-block"></div></div>}
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
                  <td className="p-3 font-bold border-r">{day} {isLoading && !idealPlan[day] && <span className="animate-spin inline-block ml-2 w-3 h-3 border-2 border-slate-200 border-t-slate-500 rounded-full"></span>}</td>
                  {MEAL_TYPES.mittag.map(c => (
                    <td key={`c-m-${c}`} className="p-3 text-slate-700 hover:bg-blue-50 cursor-pointer" onClick={() => idealPlan[day] && applyMeal(day, 'mittag', c)}>
                      {idealPlan[day]?.mittag?.[c] ?? (isLoading ? '' : '-')}
                    </td>
                  ))}
                  {MEAL_TYPES.abend.map(c => (
                    <td key={`c-a-${c}`} className="p-3 text-slate-700 hover:bg-blue-50 cursor-pointer border-l" onClick={() => idealPlan[day] && applyMeal(day, 'abend', c)}>
                      {idealPlan[day]?.abend?.[c] ?? (isLoading ? '' : '-')}
                    </td>
                  ))}
                  <td className="p-3 text-center border-l">
                    <button onClick={() => idealPlan[day] && applyDay(day)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold px-3 py-1 rounded-md text-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed" disabled={!idealPlan[day]}>
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
