

import React, { useState, useMemo, useEffect } from 'react';
import { PlannerView } from './features/weeklyPlan/PlannerView';
import { WeeklyOrderView } from './features/orders/WeeklyOrderView';
import { PrintView } from './features/print/PrintView';
import { useRecipes, RecipeDatabase, Recipe } from './hooks/useRecipes';

const App = () => {
    const [view, setView] = useState('planner');
    const [currentDate, setCurrentDate] = useState(new Date());
    const { recipes, isLoading: isLoadingRecipes, error: recipesError } = useRecipes();
    const [portionEstimates, setPortionEstimates] = useState(null);
    const [estimatesError, setEstimatesError] = useState<Error | null>(null);

    useEffect(() => {
        fetch('/portionEstimates.json')
            .then(res => {
                if (!res.ok) throw new Error(`portionEstimates.json nicht gefunden (Status: ${res.status})`);
                return res.json();
            })
            .then(data => setPortionEstimates(data))
            .catch(err => setEstimatesError(err as Error));
    }, []);

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedDate = new Date(e.target.value);
        setCurrentDate(new Date(selectedDate.valueOf() + selectedDate.getTimezoneOffset() * 60 * 1000));
    };

    const recipeMap = useMemo(() => {
        if (!recipes) return new Map<string, Recipe>();
        const map = new Map<string, Recipe>();
        const allRecipes = [
            ...Object.values(recipes.mittagessen).flat(),
            ...Object.values(recipes.abendessen).flat()
        ];
        allRecipes.forEach(recipe => {
            if (recipe) {
                map.set(recipe.name, recipe);
            }
        });
        return map;
    }, [recipes]);

    const allergenMap = useMemo(() => {
        const map = new Map<string, string[]>();
        recipeMap.forEach((recipe, name) => {
            map.set(name, recipe.allergens);
        });
        return map;
    }, [recipeMap]);

    if (isLoadingRecipes || !portionEstimates) {
        return (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="loading-spinner"></div>
            </div>
        );
    }
    
    const error = recipesError || estimatesError;
    if (error) {
        const errorMessage = error instanceof Error ? error.message : error;
        return <div className="p-8 text-center text-red-600">Fehler beim Laden der App-Daten: {errorMessage}</div>;
    }

    const renderContent = () => {
        if (!recipes) return null;

        switch(view) {
            case 'planner':
                return <PlannerView 
                    currentDate={currentDate}
                    handleDateChange={handleDateChange}
                    setView={setView}
                    recipes={recipes}
                    recipeMap={recipeMap}
                    allergenMap={allergenMap}
                    portionEstimates={portionEstimates}
                />;
            case 'orders':
                return <WeeklyOrderView 
                    currentDate={currentDate}
                    showPlanner={() => setView('planner')}
                    recipes={recipes}
                />;
            case 'print':
                return <PrintView
                    currentDate={currentDate}
                    showPlanner={() => setView('planner')}
                    allergenMap={allergenMap}
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