import { useState, useEffect, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { STORAGE_KEY, createEmptyWeekPlan } from '../utils/constants';
import { getWeekNumber } from '../utils/dateHelpers';
import { Recipe } from '../domain/types';
import { migrateMenuDataNamesToIds, needsMigration } from '../utils/menuDataMigration';

export const useWeekPlan = (currentDate: Date, recipeByNameMap: Map<string, Recipe>) => {
    const [menuData, setMenuData] = useState(() => createEmptyWeekPlan());
    const [isReady, setIsReady] = useState(false);

    const planId = useMemo(() => {
        if (!currentDate) return null;
        const year = currentDate.getFullYear();
        const weekNumber = getWeekNumber(currentDate);
        return `${year}-${weekNumber}`;
    }, [currentDate]);
    
    useEffect(() => {
        setIsReady(true);
    }, []);

    useEffect(() => {
        if (!isReady || !planId || recipeByNameMap.size === 0) return;

        try {
            const allPlans = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            let planData = allPlans[planId];
            const defaultPlan = createEmptyWeekPlan();
            
            if (!planData) {
                setMenuData(defaultPlan);
                return;
            }
            
            if (needsMigration(planData)) {
                console.log("Migration needed for plan:", planId);
                planData = migrateMenuDataNamesToIds(planData, Array.from(recipeByNameMap.values()));
                allPlans[planId] = planData;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(allPlans));
            }
            
            const newMenuData = createEmptyWeekPlan();
            const daysOfWeek = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

            daysOfWeek.forEach(day => {
                const defaultDay = defaultPlan[day];
                const loadedDay = planData[day] || {};
                
                newMenuData[day] = {
                    servings: loadedDay.servings ?? defaultDay.servings,
                    mittag: { ...defaultDay.mittag, ...(loadedDay.mittag || {}) },
                    abend: { ...defaultDay.abend, ...(loadedDay.abend || {}) },
                };
            });
            newMenuData.wochenhitMittag1 = planData.wochenhitMittag1 ?? defaultPlan.wochenhitMittag1;
            newMenuData.wochenhitMittag2 = planData.wochenhitMittag2 ?? defaultPlan.wochenhitMittag2;
            const loadedHits = Array.isArray(planData.wochenhitAbend) ? planData.wochenhitAbend : [];
            newMenuData.wochenhitAbend = defaultPlan.wochenhitAbend.map((val: string, i: number) => loadedHits[i] ?? val);

            setMenuData(newMenuData);

        } catch (error) {
            console.error("Failed to load/migrate data:", error);
            setMenuData(createEmptyWeekPlan());
        }
    }, [isReady, planId, recipeByNameMap]);

    const handleUpdateData = useCallback((path: (string | number)[], value: any) => {
        const sanitizedValue = typeof value === 'string' ? DOMPurify.sanitize(value) : value;

        setMenuData(prevMenuData => {
            try {
                const newMenuData = JSON.parse(JSON.stringify(prevMenuData));
                let current: any = newMenuData;
                for (let i = 0; i < path.length - 1; i++) {
                    if (current[path[i]] === undefined || typeof current[path[i]] !== 'object') {
                        current[path[i]] = {};
                    }
                    current = current[path[i]];
                }
                current[path[path.length - 1]] = sanitizedValue;

                const allPlans = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                allPlans[planId] = newMenuData;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(allPlans));

                return newMenuData;
            } catch (error) {
                console.error("Error updating state:", { path, value, error });
                return prevMenuData;
            }
        });
    }, [planId]);

    return { menuData, isReady, handleUpdateData };
};