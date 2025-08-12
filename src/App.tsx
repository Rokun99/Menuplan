import React, { useState, useMemo } from 'react';
import { PlannerView } from './features/weeklyPlan/PlannerView';
import { WeeklyOrderView } from './features/orders/WeeklyOrderView';
import { PrintView } from './features/print/PrintView';
import { useRecipes } from './hooks/useRecipes';
import { Recipe } from './domain/types';

const App = () => {
    const [view, setView] = useState('planner');
    const [currentDate, setCurrentDate] = useState(new Date());
    const { recipes, orderMeta, isLoading: isLoadingRecipes, error: recipesError } = useRecipes();

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedDate = new Date(e.target.value);
        setCurrentDate(new Date(selectedDate.valueOf() + selectedDate.getTimezoneOffset() * 60 * 1000));
    };

    const { recipeMap, recipeByNameMap, allergenMap } = useMemo(() => {
        const rMap = new Map<string, Recipe>();
        const rByNameMap = new Map<string, Recipe>();
        const aMap = new Map<string, string[]>();
        if (!recipes) return { recipeMap: rMap, recipeByNameMap: rByNameMap, allergenMap: aMap };
        
        recipes.forEach(recipe => {
            if (recipe?.recipeId) {
                rMap.set(recipe.recipeId, recipe);
                rByNameMap.set(recipe.name, recipe);
                aMap.set(recipe.recipeId, recipe.allergens);
            }
        });
        return { recipeMap: rMap, recipeByNameMap: rByNameMap, allergenMap: aMap };
    }, [recipes]);

    if (isLoadingRecipes) {
        return (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="ml-4 text-slate-700">Lade Rezepte...</p>
            </div>
        );
    }
    
    if (recipesError) {
        return <div className="p-8 text-center text-red-600">Fehler beim Laden der App-Daten: {recipesError}</div>;
    }

    const renderContent = () => {
        if (!recipes || !orderMeta) return null;

        switch(view) {
            case 'planner':
                return <PlannerView 
                    currentDate={currentDate}
                    handleDateChange={handleDateChange}
                    setView={setView}
                    recipes={recipes}
                    recipeMap={recipeMap}
                    recipeByNameMap={recipeByNameMap}
                    allergenMap={allergenMap}
                />;
            case 'orders':
                return <WeeklyOrderView 
                    currentDate={currentDate}
                    showPlanner={() => setView('planner')}
                    recipeMap={recipeMap}
                    recipeByNameMap={recipeByNameMap}
                    orderMeta={orderMeta}
                />;
            case 'print':
                return <PrintView
                    currentDate={currentDate}
                    showPlanner={() => setView('planner')}
                    recipeMap={recipeMap}
                    recipeByNameMap={recipeByNameMap}
                />;
            default:
                return null;
        }
    }

    return (
        <div className="p-4 sm:p-6 md:p-8">
           {renderContent()}
        </div>
    );
};

export default App;