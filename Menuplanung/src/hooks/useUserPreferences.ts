import { useState, useEffect, useCallback } from 'react';

export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState<Record<string, number>>({});
  
  useEffect(() => {
    const stored = localStorage.getItem('meal_preferences');
    if (stored) {
      setPreferences(JSON.parse(stored));
    }
  }, []);
  
  const trackSelection = useCallback((
    selection: string, 
    category: string, 
    source: 'database' | 'ai'
  ) => {
    const updated = { ...preferences };
    updated[selection] = (updated[selection] || 0) + 1;
    
    // Track source preference
    const sourceKey = `_source_${source}`;
    updated[sourceKey] = (updated[sourceKey] || 0) + 1;
    
    // Track category preference
    const categoryKey = `_category_${category}`;
    updated[categoryKey] = (updated[categoryKey] || 0) + 1;
    
    setPreferences(updated);
    localStorage.setItem('meal_preferences', JSON.stringify(updated));
    
    // Analytics event
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'meal_selection', {
        meal_name: selection,
        category: category,
        source: source
      });
    }
  }, [preferences]);
  
  const getTopPreferences = useCallback((limit = 10) => {
    return Object.entries(preferences)
      .filter(([key]) => !key.startsWith('_'))
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }, [preferences]);
  
  return { preferences, trackSelection, getTopPreferences };
};
