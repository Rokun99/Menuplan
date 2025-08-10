export const getWeekNumber = (d: Date): number => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const getWeekDays = (date: Date): Date[] => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const weekDay = new Date(startOfWeek);
        weekDay.setDate(startOfWeek.getDate() + i);
        week.push(weekDay);
    }
    return week;
};

export const formatDate = (date: Date): string => {
    return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const getSeason = (date: Date): 'Frühling' | 'Sommer' | 'Herbst' | 'Winter' => {
    const month = date.getMonth();
    if (month > 1 && month < 5) return 'Frühling';
    if (month > 4 && month < 8) return 'Sommer';
    if (month > 7 && month < 11) return 'Herbst';
    return 'Winter';
};
