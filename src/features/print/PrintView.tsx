import React from 'react';
import { useWeekPlan } from '../../hooks/useWeekPlan';
import { BackIcon, PrintIcon } from '../../components/Icons';
import { getWeekNumber, getWeekDays, formatDate } from '../../utils/dateHelpers';
import { Recipe } from '../../domain/types';

interface PrintViewProps {
    currentDate: Date;
    showPlanner: () => void;
    recipeMap: Map<string, Recipe>;
    recipeByNameMap: Map<string, Recipe>;
}

export const PrintView: React.FC<PrintViewProps> = ({ currentDate, showPlanner, recipeMap, recipeByNameMap }) => {
    const { menuData } = useWeekPlan(currentDate, recipeByNameMap);

    const handlePrint = () => {
        window.print();
    };
    
    const daysOfWeek = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const weekDays = getWeekDays(currentDate);

    const renderCellContent = (mealId: string) => {
        const recipe = recipeMap.get(mealId);
        const mealName = recipe?.name || mealId;
        if (!mealName) return <span className="text-slate-400">-</span>;
        
        const allergens = recipe?.allergens || [];
        return (
            <>
                <p>{mealName}</p>
                {allergens.length > 0 && (
                    <p className="allergens">
                        <span className="allergens-label">Allergene:</span> {allergens.join(', ')}
                    </p>
                )}
            </>
        );
    };

    return (
        <div className="print-container">
            <header className="print-controls mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Druckansicht: Menüplan</h1>
                    <p className="text-slate-500">KW {getWeekNumber(currentDate)} ({formatDate(weekDays[0])} - {formatDate(weekDays[6])})</p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={handlePrint} className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                        <PrintIcon />
                        Drucken
                    </button>
                    <button onClick={showPlanner} className="flex items-center space-x-2 bg-slate-200 text-slate-700 font-semibold p-2.5 rounded-lg hover:bg-slate-300 transition-colors">
                        <BackIcon />
                        <span>Zurück</span>
                    </button>
                </div>
            </header>

            <div className="overflow-x-auto">
                <table className="print-table">
                    <thead>
                        <tr>
                            <th className="day-column">Tag</th>
                            <th>Mittagessen</th>
                            <th>Abendessen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {daysOfWeek.map((day, index) => (
                            <tr key={day}>
                                <td className="day-column">
                                    {day}<br/>
                                    <span className="font-normal text-slate-600 text-sm">{formatDate(weekDays[index])}</span><br />
                                    <span className="font-normal text-slate-600 text-sm">Pers: {menuData[day]?.servings ?? 0}</span>
                                </td>
                                <td>
                                    <div className="mb-2"><p className="meal-category">Suppe</p>{renderCellContent(menuData[day]?.mittag?.suppe ?? '')}</div>
                                    <div className="mb-2"><p className="meal-category">Menu</p>{renderCellContent(menuData[day]?.mittag?.menu ?? '')}</div>
                                    <div className="mb-2"><p className="meal-category">Vegi</p>{renderCellContent(menuData[day]?.mittag?.vegi ?? '')}</div>
                                    <div><p className="meal-category">Dessert</p>{renderCellContent(menuData[day]?.mittag?.dessert ?? '')}</div>
                                </td>
                                <td>
                                    <div className="mb-2"><p className="meal-category">Menu</p>{renderCellContent(menuData[day]?.abend?.menu ?? '')}</div>
                                    <div><p className="meal-category">Vegi</p>{renderCellContent(menuData[day]?.abend?.vegi ?? '')}</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div className="mt-8">
                    <h2 className="text-xl font-bold text-slate-800 mb-4">Wochenhits</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                         <div>
                            <h3 className="font-semibold text-lg text-slate-700 mb-2 border-b pb-1">Mittag</h3>
                            <div className="space-y-2">
                                <div><p className="meal-category">Wochenhit Mo-Mi</p>{renderCellContent(menuData.wochenhitMittag1 ?? '')}</div>
                                <div><p className="meal-category">Wochenhit Do-Sa</p>{renderCellContent(menuData.wochenhitMittag2 ?? '')}</div>
                            </div>
                         </div>
                         <div>
                            <h3 className="font-semibold text-lg text-slate-700 mb-2 border-b pb-1">Abend</h3>
                            <div className="space-y-2">
                                {(Array.isArray(menuData.wochenhitAbend) ? menuData.wochenhitAbend : []).map((hit, i) => (
                                    <div key={i}>
                                        <p className="meal-category">Wochenhit Abend {i + 1}</p>
                                        {renderCellContent(hit)}
                                    </div>
                                ))}
                            </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};