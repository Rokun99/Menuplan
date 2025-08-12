import React, { useState } from 'react';
import { WeeklyPlanSuggestion } from './WeeklyPlanSuggestion';
import { MittagTable } from './MittagTable';
import AbendTable from './AbendTable';
import { SelectionModal } from './SelectionModal';
import { getWeekNumber } from '../../utils/dateHelpers';
import { useWeekPlan } from '../../hooks/useWeekPlan';
import { Recipe } from '../../domain/types';
import { ExportIcon, ImportIcon, OrdersIcon, PrintIcon } from '../../components/Icons';
import { STORAGE_KEY } from '../../utils/constants';

interface PlannerViewProps {
    currentDate: Date;
    handleDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    setView: (view: string) => void;
    recipes: Recipe[];
    recipeMap: Map<string, Recipe>;
    recipeByNameMap: Map<string, Recipe>;
    allergenMap: Map<string, string[]>;
}

export const PlannerView: React.FC<PlannerViewProps> = ({ currentDate, handleDateChange, setView, recipes, recipeMap, recipeByNameMap, allergenMap }) => {
    const { menuData, handleUpdateData } = useWeekPlan(currentDate, recipeByNameMap);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState<any>(null);

    const openSelectionModal = (day: string, mealType: string, category: string, index: number | null = null) => {
        setModalTarget({ day, mealType, category, index });
        setIsModalOpen(true);
    };

    const handleApplySelection = (selectionId: string) => {
        if (!modalTarget) return;
        const { day, mealType, category, index } = modalTarget;
        let path: (string | number)[];
        
        if (category === 'wochenhitAbend' && index !== null) {
            path = ['wochenhitAbend', index];
        } else if (category.startsWith('wochenhitMittag')) {
            path = [category];
        } else if (day && mealType && category) {
            path = [day, mealType, category];
        } else {
            return;
        }
        handleUpdateData(path, selectionId);
        setIsModalOpen(false);
    };

    const handleExport = () => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data || data === '{}') {
                alert("Keine Daten zum Exportieren vorhanden.");
                return;
            }
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kaeppeli-menu-plans-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Export fehlgeschlagen.");
        }
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                JSON.parse(text); // Validate JSON format
                localStorage.setItem(STORAGE_KEY, text);
                alert("Import erfolgreich! Die Seite wird neu geladen, um die Änderungen zu übernehmen.");
                location.reload();
            } catch (error) {
                alert("Import fehlgeschlagen: Ungültige JSON-Datei.");
                console.error("Import error:", error);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input to allow re-importing the same file
    };

    return (
        <>
            <SelectionModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onApply={handleApplySelection} 
                target={modalTarget} 
                menuData={menuData} 
                currentDate={currentDate}
                recipes={recipes}
                recipeMap={recipeMap}
            />
        
            <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 p-4 bg-white rounded-xl shadow-lg">
                <h1 className="text-2xl font-bold text-slate-800">Käppeli Menüplanung</h1>
                <div className="flex-grow flex justify-center items-center gap-4 bg-slate-100 p-2 rounded-lg">
                    <label htmlFor="week-picker" className="font-semibold text-slate-700 text-sm">Woche:</label>
                    <input type="date" id="week-picker" value={currentDate.toISOString().split('T')[0]} onChange={handleDateChange} className="border-slate-300 rounded-md shadow-sm p-1.5 text-sm"/>
                    <span className="font-semibold text-slate-700 text-sm">KW {getWeekNumber(currentDate)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExport} className="p-2.5 bg-white border border-slate-300 text-slate-600 rounded-lg shadow-sm hover:bg-slate-100 transition-colors" title="Alle Pläne als JSON exportieren">
                        <ExportIcon />
                    </button>
                    <label htmlFor="import-file" className="p-2.5 bg-white border border-slate-300 text-slate-600 rounded-lg shadow-sm hover:bg-slate-100 transition-colors cursor-pointer" title="Pläne aus JSON-Datei importieren">
                        <ImportIcon />
                    </label>
                    <input type="file" id="import-file" accept=".json" onChange={handleImport} className="hidden" />
                    <button onClick={() => setView('orders')} className="p-2.5 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors" title="Gesamte Wochenbestellung anzeigen">
                        <OrdersIcon />
                    </button>
                     <button onClick={() => setView('print')} className="p-2.5 bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors" title="Druckansicht öffnen">
                        <PrintIcon />
                    </button>
                </div>
            </header>

            <WeeklyPlanSuggestion
                currentDate={currentDate}
                handleUpdateData={handleUpdateData}
                recipes={recipes}
            />
            
            <MittagTable 
                menuData={menuData}
                currentDate={currentDate}
                handleUpdateData={handleUpdateData}
                openSelectionModal={openSelectionModal}
                allergenMap={allergenMap}
                recipeMap={recipeMap}
            />
            
            <AbendTable 
                menuData={menuData}
                currentDate={currentDate}
                handleUpdateData={handleUpdateData}
                openSelectionModal={openSelectionModal}
                allergenMap={allergenMap}
                recipeMap={recipeMap}
            />
        </>
    );
};