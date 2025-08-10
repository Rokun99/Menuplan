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
            if (day === 'Freitag' && category === 'menu') {
                dbCategoryKey = 'fisch';
            }
            if (recipes.mittagessen && recipes.mittagessen[dbCategoryKey]) {
                list = recipes.mittagessen[dbCategoryKey];
            }
        } else if (mealType === 'abend') {
            const categoryMap: { [key: string]: string } = { menu: "Abendessen", vegi: "Vegi-Abendessen" };
            name = categoryMap[category] || "Abendessen";
            const dbCategoryKey = category as keyof AbendessenCategory;
            if (recipes.abendessen && recipes.abendessen[dbCategoryKey]) {
                list = recipes.abendessen[dbCategoryKey];
            }
        }
        
        return { recipeCategoryList: list || [], categoryName: name };
    }, [target, recipes]);

    const filteredItems = recipeCategoryList.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const generateSuggestions = async () => {
        if (!target) return;
        setIsLoading(true);
        setError('');
        setSuggestions([]);

        const promptForSuggestions = {
            task: `Generiere 5-7 kreative und passende Menüvorschläge für die Kategorie '${categoryName}'.`,
            context: {
                season: getSeason(currentDate),
                existingMealsInDatabase: recipeCategoryList.slice(0, 10).map(r => r.name)
            },
            rules: [
                "Alle Vorschläge müssen zur gewählten Kategorie passen.",
                "Keine Wiederholungen von den existierenden Mahlzeiten.",
                "Nur kurze, präzise Namen ohne Backslashes oder Zeilenumbrüche."
            ]
        };

        try {
            const response = await fetch('/.netlify/functions/generate-suggestion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: JSON.stringify(promptForSuggestions),
                    // Schema für eine einfache Liste von Strings
                    schema: { type: 'array', items: { type: 'string' } }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Netzwerk-Antwort war nicht OK (${response.status})`);
            }
            
            const data = await response.json();
            const text = data.text;
            const parsedSuggestions = JSON.parse(text);
            setSuggestions(parsedSuggestions);
        } catch (err) {
            console.error("Error generating suggestions:", err);
            setError(`Fehler bei der Generierung der Vorschläge: ${(err as Error).message}`);
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
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-3xl flex flex-col" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-semibold mb-6 text-slate-800">"{categoryName}" auswählen</h3>
                <div className="grid md:grid-cols-2 gap-6 flex-1">
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Aus Datenbank</h4>
                        <input type="text" placeholder="Suchen..." className="w-full p-2 border border-slate-300 rounded-md mb-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <div className="h-64 overflow-y-auto border border-slate-200 rounded-md bg-slate-50/50">
                            {filteredItems.length > 0 ? filteredItems.map((item, i) => {
                                const evaluation = target ? evaluateDishInContext(item, dayPlan) : { score: 'neutral' as 'neutral' };
                                const isVegetarian = vegetarianRecipeNames.has(item.name);
                                return (
                                    <button key={i} onClick={() => onApply(item.name)} className="w-full text-left p-3 text-sm hover:bg-blue-100 transition-colors flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TrafficLight score={evaluation.score} />
                                            <span className="flex-1 pr-2">{item.name}</span>
                                        </div>
                                        {isVegetarian && (
                                            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">Vegi</span>
                                        )}
                                    </button>
                                );
                            }) : <p className="p-3 text-sm text-slate-500">Keine Einträge gefunden.</p>}
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Ideen</h4>
                        <button onClick={generateSuggestions} disabled={isLoading} className="w-full mb-2 flex justify-center items-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-all">
                            {isLoading ? 'Lade...' : 'Ideen generieren'}
                        </button>
                        <div className="h-64 overflow-y-auto border border-slate-200 rounded-md relative bg-slate-50/50">
                            {isLoading && <LoadingSpinner />}
                            {error && <p className="p-3 text-sm text-red-600">{error}</p>}
                            {suggestions.length > 0 ? suggestions.map((item, i) => (
                                <button key={i} onClick={() => onApply(item)} className="w-full text-left p-3 text-sm hover:bg-blue-100 transition-colors">{item}</button>
                            )) : !isLoading && !error && <p className="p-3 text-sm text-slate-500\">Klicken Sie auf den Button, um Ideen zu erhalten.</p>}
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors\">Schliessen</button>
                </div>
            </div>
        </div>
    );
};
