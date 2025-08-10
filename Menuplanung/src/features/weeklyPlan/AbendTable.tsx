import React from 'react';
import { EditableCell } from '../../components/EditableCell';
import { getWeekDays, formatDate } from '../../utils/dateHelpers';
import { RecipeDatabase, Recipe } from '../../hooks/useRecipes';
import { useDayNutrition } from '../../hooks/useDayNutrition';

interface AbendTableProps {
  menuData: any;
  currentDate: Date;
  handleUpdateData: (path: (string | number)[], value: any) => void;
  openSelectionModal: (
    day: string,
    mealType: string,
    category: string,
    index?: number
  ) => void;
  allergenMap: Map<string, string[]>;
  recipes: RecipeDatabase;
  recipeMap: Map<string, Recipe>;
  portionEstimates: any;
}

const AbendTable: React.FC<AbendTableProps> = ({
  menuData,
  currentDate,
  handleUpdateData,
  openSelectionModal,
  allergenMap,
  recipes,
  recipeMap,
  portionEstimates,
}) => {
  const daysOfWeek = [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
    'Sonntag',
  ];
  const weekDays = getWeekDays(currentDate);

  return (
    <div className="mb-10 bg-white rounded-xl shadow-lg overflow-hidden">
      <h2 className="text-2xl font-bold text-slate-800 mb-0 p-6 bg-slate-50 border-b border-slate-200">
        Abendessen
      </h2>

      <div className="planner-grid-abend">
        {/* Header */}
        <div className="planner-header header-abend">Montag - Sonntag</div>
        <div className="planner-header header-abend">Menu</div>
        <div className="planner-header header-abend">Vegetarisches Menu</div>
        <div className="planner-header header-abend">Der Wochenhit</div>

        {/* Body */}
        {daysOfWeek.map((day, index) => {
          const dayPlan = menuData[day];
          const { nutritionReport, nutritionStatus } = useDayNutrition(dayPlan, recipeMap, portionEstimates);

          return (
            <React.Fragment key={`${day}-abend`}>
              {/* Day cell */}
              <div className="planner-cell bg-slate-50 flex justify-between items-center p-2">
                <div>
                  <p className="font-bold text-slate-800 text-lg">{day}</p>
                  <p className="text-xs text-slate-500">{formatDate(weekDays[index])}</p>
                </div>
                <div className="relative has-tooltip self-start pt-1">
                    <div className={`nutrition-status-indicator status-${nutritionStatus}`}></div>
                    {nutritionReport && (
                        <div className="nutrition-tooltip">
                            <h4>Tagesanalyse (Mittag & Abend)</h4>
                            <ul>
                                {nutritionReport.warnings.map((w, i) => (
                                    <li key={`w-${i}`} className="tooltip-warning">{w}</li>
                                ))}
                                {nutritionReport.suggestions.map((s, i) => (
                                    <li key={`s-${i}`} className="tooltip-suggestion">{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
              </div>

              {/* Menu */}
              <div className="planner-cell p-0">
                <EditableCell
                  value={menuData[day]?.abend?.menu ?? ''}
                  allergens={allergenMap.get(menuData[day]?.abend?.menu ?? '')}
                  onSave={(val) => handleUpdateData([day, 'abend', 'menu'], val)}
                  onSingleClick={() => openSelectionModal(day, 'abend', 'menu')}
                />
              </div>

              {/* Vegi */}
              <div className="planner-cell p-0">
                <EditableCell
                  value={menuData[day]?.abend?.vegi ?? ''}
                  allergens={allergenMap.get(menuData[day]?.abend?.vegi ?? '')}
                  onSave={(val) => handleUpdateData([day, 'abend', 'vegi'], val)}
                  onSingleClick={() => openSelectionModal(day, 'abend', 'vegi')}
                />
              </div>

              {/* Wochenhit – only once for the whole column */}
              {index === 0 && (
                <div
                  className="planner-cell p-0"
                  style={{ gridColumn: 4, gridRow: '2 / span 7' }}
                >
                  <div className="p-2 space-y-1 h-full flex flex-col">
                    {(Array.isArray(menuData.wochenhitAbend)
                      ? menuData.wochenhitAbend
                      : []
                    ).map((hit, i) => (
                      <div key={i} className="flex-1">
                        <EditableCell
                          value={hit ?? ''}
                          allergens={allergenMap.get(hit ?? '')}
                          onSave={(val) =>
                            handleUpdateData(['wochenhitAbend', i], val)
                          }
                          onSingleClick={() =>
                            openSelectionModal(
                              'Wochenhit',
                              'abend',
                              'wochenhitAbend',
                              i
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default AbendTable;