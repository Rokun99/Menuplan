import React, { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { RecipeDatabase, Recipe, MittagessenCategory, AbendessenCategory } from '../../hooks/useRecipes';
import { getSeason, formatDate } from '../../utils/dateHelpers';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { evaluateDishInContext } from '../../rules/nutritionRules';

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

const TrafficLight: React.FC<{ score: 'good' | 'average' | 'bad' | 'neutral' }> = ({ score }) => {
    const scoreMap = {
        good: 'traffic-light-green',
        average: 'traffic-light-yellow',
        bad: 'traffic-light-red',
        neutral: 'traffic-light-gray'
    };
    return <div className={clsx('traffic-light', scoreMap[score])}></div>;
};

export const SelectionModal: React.FC<SelectionModalProps> = ({ isOpen, onClose, onApply, target, menuData, currentDate, recipes, recipeMap }) => {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const vegetarianRecipeNames = useMemo(() => {
        if (!recipes) return new Set();
        const names = new Set<string>();
        (recipes.mittagessen.vegi || []).forEach(recipe => names.add(recipe.name));
        (recipes.abendessen.vegi || []).forEach(recipe => names.add(recipe.name));
        return names;
    }, [recipes]);

    const dayPlan = useMemo(() => {
        if (!target || !menuData[target.day]) return [];
        const dayData = menuData[target.day];
        const mittagValues = dayData?.mittag ? Object.values(dayData.mittag) : [];
        const abendValues = dayData?.abend ? Object.values(dayData.abend) : [];
        
        return [
            ...mittagValues,
            ...abendValues
        ].map(name => recipeMap.get(name as string)).filter(Boolean) as Recipe[];
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
            const categoryMap: { [key: string]: string } = { suppe: "Suppe", dessert: "Dessert", menu: "Hauptgang", vegi: "Vegi-Hauptgang" };
            name = categoryMap[category] || "Gericht";
            let dbCategoryKey = category as keyof MittagessenCategory;
            if (day === 'Freitag' && category === 'menu') dbCategoryKey = 'fisch';
            if (recipes.mittagessen?.[dbCategoryKey]) list = recipes.mittagessen[dbCategoryKey];
        } else if (mealType === 'abend') {
            const categoryMap: { [key: string]: string } = { menu: "Abendessen", vegi: "Vegi-Abendessen" };
            name = categoryMap[category] || "Abendessen";
            const dbCategoryKey = category as keyof AbendessenCategory;
            if (recipes.abendessen?.[dbCategoryKey]) list = recipes.abendessen[dbCategoryKey];
        }
        
        return { recipeCategoryList: list || [], categoryName: name };
    }, [target, recipes]);

    const filteredItems = recipeCategoryList.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const generateSuggestions = async () => {
        if (!categoryName) return;
        setIsLoading(true);
        setError('');
        setSuggestions([]);

        const promptObject = {
            task: `Generiere 5-7 kreative Vorschläge für die Kategorie '${categoryName}'.`,
            rules: [
                "Vorschläge müssen zur Kategorie passen und für ältere Menschen geeignet sein.",
                "Keine Wiederholung von existierenden Optionen aus der Datenbank.",
                "Nur kurze, präzise Namen ohne Sonderzeichen."
            ],
            existingOptions: recipeCategoryList.map(r => r.name).slice(0, 15)
        };
        
        const responseSchema = {
            type: "object",
            properties: { suggestions: { type: "array", items: { type: "string" } } }
        };

        try {
            const res = await fetch('/.netlify/functions/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promptObject, schema: responseSchema }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Server returned an invalid error format.' }));
                throw new Error(errData.error || `Netzwerk-Antwort war nicht OK (${res.status})`);
            }
            
            const data = await res.json();
            const parsed = JSON.parse(data.text);
            const suggestionsList = parsed.suggestions || (Array.isArray(parsed) ? parsed : []);
            setSuggestions(suggestionsList);
        } catch (err) {
            console.error("Error generating suggestions:", err);
            setError(`Fehler: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        if(isOpen) { setSearchTerm(''); setSuggestions([]); setError(''); setIsLoading(false); }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-semibold mb-6 text-slate-800">"{categoryName}" auswählen</h3>
                <div className="grid md:grid-cols-2 gap-6 flex-1 overflow-hidden">
                    <div className="flex flex-col overflow-hidden">
                        <h4 className="font-semibold text-slate-700 mb-2">Aus Datenbank</h4>
                        <input type="text" placeholder="Suchen..." className="w-full p-2 border border-slate-300 rounded-md mb-2" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-md bg-slate-50/50">
                            {filteredItems.map((item, i) => {
                                const evaluation = evaluateDishInContext(item, dayPlan);
                                return (
                                    <button key={i} onClick={() => onApply(item.name)} className="w-full text-left p-3 text-sm hover:bg-blue-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TrafficLight score={evaluation.score} />
                                            <span>{item.name}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <h4 className="font-semibold text-slate-700 mb-2">KI-Vorschläge</h4>
                        <button onClick={generateSuggestions} disabled={isLoading} className="w-full mb-2 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                            {isLoading ? 'Generiere...' : 'Ideen generieren'}
                        </button>
                        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-md relative bg-slate-50/50">
                            {isLoading && <LoadingSpinner />}
                            {error && <p className="p-3 text-sm text-red-600">{error}</p>}
                            {suggestions.map((item, i) => (
                                <button key={i} onClick={() => onApply(item)} className="w-full text-left p-3 text-sm hover:bg-blue-100">{item}</button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-300">Schliessen</button>
                </div>
            </div>
        </div>
    );
};
