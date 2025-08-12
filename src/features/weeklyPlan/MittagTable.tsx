import React from 'react';
import { EditableCell } from '../../components/EditableCell';
import { getWeekDays, formatDate } from '../../utils/dateHelpers';
import { Recipe } from '../../domain/types';
import { useDayNutrition } from '../../hooks/useDayNutrition';

interface MittagTableProps {
    menuData: any;
    currentDate: Date;
    handleUpdateData: (path: (string | number)[], value: any) => void;
    openSelectionModal: (day: string, mealType: string, category: string) => void;
    allergenMap: Map<string, string[]>;
    recipeMap: Map<string, Recipe>;
}

export const MittagTable: React.FC<MittagTableProps> = ({ menuData, currentDate, handleUpdateData, openSelectionModal, allergenMap, recipeMap }) => {
    const daysOfWeek = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const weekDays = getWeekDays(currentDate);

    return (
        <div className="mb-10 bg-white rounded-xl shadow-lg overflow-hidden">
            <h2 className="text-2xl font-bold text-slate-800 mb-0 p-6 bg-slate-50 border-b border-slate-200">Mittagessen</h2>
            <div className="planner-grid">
                <div className="planner-header header-planung">Planung</div>
                <div className="planner-header header-menu">Suppe / Dessert</div>
                <div className="planner-header header-menu">Menu</div>
                <div className="planner-header header-menu">Vegetarisches Menu</div>
                <div className="planner-header header-menu">Der Wochenhit</div>
                
                {daysOfWeek.map((day, index) => {
                    const dayPlan = menuData[day];
                    const { nutritionReport, nutritionStatus } = useDayNutrition(dayPlan, recipeMap, 'mittag');
                    
                    const getRecipeName = (id: string) => recipeMap.get(id)?.name ?? id ?? '';
                    const getRecipeAllergens = (id: string) => allergenMap.get(id) ?? [];


                    return (
                        <React.Fragment key={`${day}-mittag`}>
                            <div className="planner-cell bg-slate-50 flex flex-col p-2 justify-between">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold text-slate-800 text-lg">{day}</p>
                                        <p className="text-xs text-slate-500">{formatDate(weekDays[index])}</p>
                                    </div>
                                    <div className="relative has-tooltip">
                                        <div className={`nutrition-status-indicator status-${nutritionStatus}`}></div>
                                        {nutritionReport && (
                                            <div className="nutrition-tooltip">
                                                <h4>Mahlzeitanalyse (pro Person)</h4>
                                                 <p className="text-xs mb-2">
                                                    Total: <strong>{Math.round(nutritionReport.kcalMeal)} kcal</strong> / 
                                                    Ziel: {Math.round(nutritionReport.targetMeal)} kcal
                                                    <span className={nutritionReport.color === 'red' ? 'text-red-400' : nutritionReport.color === 'yellow' ? 'text-yellow-400' : 'text-green-400'}>
                                                        ({nutritionReport.deviationPct > 0 ? '+' : ''}{nutritionReport.deviationPct.toFixed(0)}%)
                                                    </span>
                                                </p>
                                                <ul>
                                                    {nutritionReport.notes.map((note, i) => (
                                                        <li key={`note-${i}`} className={note.type === 'warning' ? 'tooltip-warning' : 'tooltip-suggestion'}>
                                                            {note.text}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    <label className="text-xs mr-1 font-medium text-slate-600">Pers:</label>
                                    <input 
                                        type="number" 
                                        value={menuData[day]?.servings ?? 0} 
                                        onChange={(e) => handleUpdateData([day, 'servings'], parseInt(e.target.value, 10) || 0)} 
                                        className="w-14 p-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500" 
                                    />
                                </div>
                            </div>
                            <div className="planner-cell p-0">
                                <div className="flex-1">
                                    <EditableCell value={getRecipeName(menuData[day]?.mittag?.suppe)} allergens={getRecipeAllergens(menuData[day]?.mittag?.suppe)} onSave={(val) => handleUpdateData([day, 'mittag', 'suppe'], val)} onSingleClick={() => openSelectionModal(day, 'mittag', 'suppe')} />
                                </div>
                                <div className="border-t border-slate-200 flex-1">
                                    <EditableCell value={getRecipeName(menuData[day]?.mittag?.dessert)} allergens={getRecipeAllergens(menuData[day]?.mittag?.dessert)} onSave={(val) => handleUpdateData([day, 'mittag', 'dessert'], val)} onSingleClick={() => openSelectionModal(day, 'mittag', 'dessert')} />
                                </div>
                            </div>
                            <div className="planner-cell p-0">
                                <EditableCell value={getRecipeName(menuData[day]?.mittag?.menu)} allergens={getRecipeAllergens(menuData[day]?.mittag?.menu)} onSave={(val) => handleUpdateData([day, 'mittag', 'menu'], val)} onSingleClick={() => openSelectionModal(day, 'mittag', 'menu')} />
                            </div>
                            <div className="planner-cell p-0">
                                <EditableCell value={getRecipeName(menuData[day]?.mittag?.vegi)} allergens={getRecipeAllergens(menuData[day]?.mittag?.vegi)} onSave={(val) => handleUpdateData([day, 'mittag', 'vegi'], val)} onSingleClick={() => openSelectionModal(day, 'mittag', 'vegi')} />
                            </div>
                            
                            {index === 0 && (
                                <div className="planner-cell p-0" style={{ gridRow: 'span 3' }}>
                                    <EditableCell value={getRecipeName(menuData.wochenhitMittag1)} allergens={getRecipeAllergens(menuData.wochenhitMittag1)} onSave={(val) => handleUpdateData(['wochenhitMittag1'], val)} onSingleClick={() => openSelectionModal('Wochenhit Mo-Mi', 'mittag', 'wochenhitMittag1')} />
                                </div>
                            )}
                            {index === 3 && (
                                <div className="planner-cell p-0" style={{ gridRow: 'span 4' }}>
                                    <EditableCell value={getRecipeName(menuData.wochenhitMittag2)} allergens={getRecipeAllergens(menuData.wochenhitMittag2)} onSave={(val) => handleUpdateData(['wochenhitMittag2'], val)} onSingleClick={() => openSelectionModal('Wochenhit Do-So', 'mittag', 'wochenhitMittag2')} />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};