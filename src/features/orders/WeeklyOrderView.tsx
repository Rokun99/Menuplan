
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useWeekPlan } from '../../hooks/useWeekPlan';
import { Recipe } from '../../domain/types';
import { getWeekDays, getWeekNumber, formatDate } from '../../utils/dateHelpers';
import { generateOrderList } from './orderEngine';
import { SUPPLIERS } from '../../utils/constants';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { GenerateIcon, BackIcon, PdfIcon, CsvIcon } from '../../components/Icons';
import { OrderLine } from '../../domain/types';


interface WeeklyOrderViewProps {
    currentDate: Date;
    showPlanner: () => void;
    recipeMap: Map<string, Recipe>;
    recipeByNameMap: Map<string, Recipe>;
    orderMeta: any;
}

export const WeeklyOrderView: React.FC<WeeklyOrderViewProps> = ({ currentDate, showPlanner, recipeMap, recipeByNameMap, orderMeta }) => {
    const { menuData } = useWeekPlan(currentDate, recipeByNameMap);
    const [orders, setOrders] = useState<Record<string, OrderLine[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isCalculated, setIsCalculated] = useState(false);
    const [error, setError] = useState('');
    const [warnings, setWarnings] = useState<string[]>([]);
    
    const weekDates = getWeekDays(currentDate);
    const weekNumber = getWeekNumber(currentDate);
    
    const handleGenerateOrderList = async () => {
        setIsLoading(true);
        setError('');
        setWarnings([]);
        try {
            const { groupedOrders, warnings: orderWarnings } = generateOrderList(menuData, recipeMap, orderMeta);
            setOrders(groupedOrders);
            setWarnings(orderWarnings);
            setIsCalculated(true);
        } catch (e) {
            console.error("Error in order generation:", e);
            setError(`Ein Fehler ist aufgetreten: ${(e as Error).message}`);
        }
        setIsLoading(false);
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(`Wochenbestellung KW ${weekNumber}`, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}`, 14, 29);

        let yPos = 40;

        Object.entries(orders).forEach(([supplierCategory, items]) => {
            const supplierName = Object.keys(SUPPLIERS).find(key => SUPPLIERS[key].categories.includes(supplierCategory)) || supplierCategory;

            if (doc.internal.pageSize.height - yPos < 40) {
              doc.addPage();
              yPos = 20;
            }
            
            doc.setFontSize(14);
            doc.text(supplierName || supplierCategory, 14, yPos);
            yPos += 2;

            autoTable(doc, {
                startY: yPos,
                head: [['Produkt', 'Netto (g)', 'Brutto (g)', 'Packungen', 'Bestellmenge (g)', 'Rest (g)']],
                body: items.map(item => [
                    item.name, 
                    item.netRequiredG, 
                    item.grossRequiredG, 
                    item.packs || '-', 
                    item.orderQtyG ? `${item.orderQtyG}` : '-',
                    item.orderQtyG ? item.orderQtyG - item.grossRequiredG : '-'
                ]),
                theme: 'grid',
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 9 },
            });
            
            yPos = (doc as any).lastAutoTable.finalY + 15;
        });

        doc.save(`bestellung_kw${weekNumber}.pdf`);
    };

    const exportToCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,Lieferant,Produkt,Nettomenge (g),Bruttomenge (g),Packungen,Bestellmenge (g),Restmenge (g)\n";
        Object.entries(orders).forEach(([supplierCategory, items]) => {
            const supplierName = Object.keys(SUPPLIERS).find(key => SUPPLIERS[key].categories.includes(supplierCategory)) || supplierCategory;
            items.forEach(item => {
                const row = [
                    `"${supplierName}"`, `"${item.name}"`, 
                    item.netRequiredG, item.grossRequiredG, 
                    item.packs || 0, item.orderQtyG || 0,
                    item.orderQtyG ? item.orderQtyG - item.grossRequiredG : 0
                ].join(",");
                csvContent += row + "\n";
            });
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `bestellung_kw${weekNumber}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    return (
         <div className="p-4 sm:p-6 md:p-8">
            <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-3xl font-bold text-slate-800">Wochenbestellung KW {weekNumber}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={exportToPDF} disabled={!isCalculated || Object.keys(orders).length === 0} className="bg-red-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-300 transition-all flex items-center gap-2">
                        <PdfIcon /> PDF
                    </button>
                    <button onClick={exportToCSV} disabled={!isCalculated || Object.keys(orders).length === 0} className="bg-green-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-green-300 transition-all flex items-center gap-2">
                        <CsvIcon /> CSV
                    </button>
                    <button onClick={showPlanner} className="flex items-center space-x-2 bg-slate-200 text-slate-700 font-semibold p-2.5 rounded-lg hover:bg-slate-300 transition-colors">
                        <BackIcon />
                        <span className="hidden sm:inline">Zurück zum Plan</span>
                    </button>
                </div>
            </header>
            <div className="relative min-h-[400px]">
                {isLoading && <LoadingSpinner />}
                {error && <p className="text-center text-red-600">{error}</p>}
                 {!isLoading && !error && !isCalculated && (
                    <div className="text-center text-slate-500 pt-10 flex flex-col items-center gap-4">
                        <p className="text-lg">Die Bestellliste für diese Woche wurde noch nicht berechnet.</p>
                        <button onClick={handleGenerateOrderList} disabled={isLoading} className="bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center gap-2">
                            <GenerateIcon /> Bestellung berechnen
                        </button>
                    </div>
                )}
                {isCalculated && !isLoading && !error && (!orders || Object.keys(orders).length === 0) && (
                    <div className="text-center text-slate-500 pt-10">
                        <p>Für den aktuellen Plan konnten keine Bestellungen generiert werden.</p>
                        <p className="text-sm mt-2">Stellen Sie sicher, dass Gerichte im Plan eingetragen sind und versuchen Sie es erneut.</p>
                         <button onClick={handleGenerateOrderList} disabled={isLoading} className="mt-4 bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center gap-2 mx-auto">
                            <GenerateIcon /> Erneut berechnen
                        </button>
                    </div>
                )}
                {isCalculated && orders && Object.keys(orders).length > 0 && (
                    <div className="space-y-8">
                        {warnings.length > 0 && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm space-y-1">
                                <h4 className="font-bold">Hinweise zur Berechnung:</h4>
                                <ul className="list-disc list-inside">
                                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}
                        {Object.entries(SUPPLIERS).map(([supplierName, supplierInfo]) => {
                            const supplierItems: OrderLine[] = [];
                            supplierInfo.categories.forEach(cat => {
                                if (orders[cat]) {
                                    supplierItems.push(...orders[cat]);
                                }
                            });

                            if (supplierItems.length === 0) return null;
                            
                            return (
                                <div key={supplierName} className="bg-white rounded-xl shadow-lg overflow-hidden">
                                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800">{supplierName}</h3>
                                            <p className="text-xs text-slate-500">{supplierInfo.address}</p>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-slate-100">
                                                <tr>
                                                    <th className="px-4 py-2 text-left font-semibold text-slate-600">Produkt</th>
                                                    <th className="px-4 py-2 text-right font-semibold text-slate-600">Netto (g)</th>
                                                    <th className="px-4 py-2 text-right font-semibold text-slate-600">Brutto (g)</th>
                                                    <th className="px-4 py-2 text-right font-semibold text-slate-600">Packungen</th>
                                                    <th className="px-4 py-2 text-right font-semibold text-slate-600">Bestellmenge (g)</th>
                                                    <th className="px-4 py-2 text-right font-semibold text-slate-600">Restmenge (g)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                 {supplierItems.map((item, index) => (
                                                    <tr key={index} className="border-t border-slate-200 hover:bg-slate-50">
                                                        <td className="px-4 py-2 text-slate-800">{item.name}</td>
                                                        <td className="px-4 py-2 text-right text-slate-600">{item.netRequiredG}</td>
                                                        <td className="px-4 py-2 text-right text-slate-600">{item.grossRequiredG}</td>
                                                        <td className="px-4 py-2 text-right text-slate-600">{item.packs || '-'}</td>
                                                        <td className="px-4 py-2 text-right font-medium text-slate-800">{item.orderQtyG || '-'}</td>
                                                        <td className="px-4 py-2 text-right text-slate-600">{item.orderQtyG ? item.orderQtyG - item.grossRequiredG : '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};