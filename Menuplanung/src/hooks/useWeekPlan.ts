import { useState, useEffect, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { STORAGE_KEY, createEmptyWeekPlan } from '../utils/constants';
import { getWeekNumber } from '../utils/dateHelpers';

export const useWeekPlan = (currentDate: Date) => {
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
        if (!isReady || !planId) return;

        try {
            const allPlans = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const planData = allPlans[planId];
            const defaultPlan = createEmptyWeekPlan();
            
            if (!planData) {
                setMenuData(defaultPlan);
                return;
            }

            // Create a new plan by deeply merging the default with the loaded data to ensure data integrity
            const newMenuData = createEmptyWeekPlan();
            const daysOfWeek = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

            daysOfWeek.forEach(day => {
                const defaultDay = defaultPlan[day];
                const loadedDay = planData[day] || {}; // Ensure loadedDay is at least an empty object
                
                newMenuData[day] = {
                    servings: loadedDay.servings ?? defaultDay.servings,
                    mittag: {
                        ...defaultDay.mittag,
                        ...(loadedDay.mittag || {}),
                    },
                    abend: {
                        ...defaultDay.abend,
                        ...(loadedDay.abend || {}),
                    }
                };
            });

            // Merge week-specific data
            newMenuData.wochenhitMittag1 = planData.wochenhitMittag1 ?? defaultPlan.wochenhitMittag1;
            newMenuData.wochenhitMittag2 = planData.wochenhitMittag2 ?? defaultPlan.wochenhitMittag2;
            
            // Handle wochenhitAbend array to ensure it's always a 4-element array
            const loadedHits = Array.isArray(planData.wochenhitAbend) ? planData.wochenhitAbend : [];
            newMenuData.wochenhitAbend = defaultPlan.wochenhitAbend.map((val: string, i: number) => loadedHits[i] ?? val);

            setMenuData(newMenuData);

        } catch (error) {
            console.error("Failed to load or merge data from LocalStorage:", error);
            setMenuData(createEmptyWeekPlan()); // Fallback to a clean state on any error
        }
    }, [isReady, planId]);

    const handleUpdateData = useCallback((path: (string | number)[], value: any) => {
        const sanitizedValue = typeof value === 'string' ? DOMPurify.sanitize(value) : value;

        setMenuData(prevMenuData => {
            try {
                const newMenuData = JSON.parse(JSON.stringify(prevMenuData));
                let current: any = newMenuData;
                for (let i = 0; i < path.length - 1; i++) {
                    current = current[path[i]];
                }
                current[path[path.length - 1]] = sanitizedValue;

                const allPlans = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                allPlans[planId] = newMenuData;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(allPlans));

                return newMenuData;
            } catch (error) {
                console.error("Error updating state. Path or state might be invalid.", { path, value, error });
                return prevMenuData;
            }
        });
    }, [planId]);

    return { menuData, isReady, handleUpdateData };
};
