import { useCallback } from 'react';

interface MealEntry {
  name: string;
  timestamp: number;
}

interface DayHistory {
  date: string;
  meals: MealEntry[];
}

export const useMenuHistory = () => {
  const getRecentMeals = useCallback(async (days: number = 7): Promise<string[]> => {
    // Fetch from your backend or local storage
    const stored = localStorage.getItem('menu_history');
    if (!stored) return [];
    
    const history: DayHistory[] = JSON.parse(stored);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return history
      .filter((entry) => new Date(entry.date) > cutoffDate)
      .flatMap((entry) => entry.meals)
      .map((meal) => meal.name);
  }, []);
  
  const getMealFrequency = useCallback((): Record<string, number> => {
    const stored = localStorage.getItem('meal_frequency');
    return stored ? JSON.parse(stored) : {};
  }, []);
  
  const saveMealSelection = useCallback((meal: string, date: Date) => {
    // Update history
    const historyStr = localStorage.getItem('menu_history');
    const history: DayHistory[] = historyStr ? JSON.parse(historyStr) : [];
    
    const dateStr = date.toISOString().split('T')[0];
    let dayEntry = history.find((e) => e.date === dateStr);
    
    if (!dayEntry) {
      dayEntry = { date: dateStr, meals: [] };
      history.push(dayEntry);
    }
    
    dayEntry.meals.push({ name: meal, timestamp: Date.now() });
    
    // Keep only last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const filtered = history.filter((e) => new Date(e.date) > cutoff);
    
    localStorage.setItem('menu_history', JSON.stringify(filtered));
    
    // Update frequency
    const freqStr = localStorage.getItem('meal_frequency');
    const frequency = freqStr ? JSON.parse(freqStr) : {};
    frequency[meal] = (frequency[meal] || 0) + 1;
    localStorage.setItem('meal_frequency', JSON.stringify(frequency));
  }, []);
  
  return { getRecentMeals, getMealFrequency, saveMealSelection };
};
