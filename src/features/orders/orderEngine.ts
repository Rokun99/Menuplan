import { Recipe, OrderLine } from '../../domain/types';
import { aggregateWeeklyOrder } from '../../domain/ordering';

/**
 * Acts as a bridge between the application's data structures and the canonical domain logic.
 * It prepares the data, calls the core `aggregateWeeklyOrder` function, and groups the results for display.
 */
export const generateOrderList = (
    menuData: any,
    recipeMap: Map<string, Recipe>,
    orderMeta: any
) => {
    // 1. Call the canonical domain function to get the flat, aggregated order list and any warnings.
    const { orderLines, warnings } = aggregateWeeklyOrder(menuData, recipeMap);
    
    // 2. Group the flat list by supplier category for the UI.
    const groupedBySupplier: Record<string, OrderLine[]> = {};
    orderLines.forEach(item => {
        // Find the ingredient's meta information to get its supplier category
        const meta = orderMeta[item.name] || {};
        const supplierCategory = meta.supplier || 'Unbekannt';

        if (!groupedBySupplier[supplierCategory]) {
            groupedBySupplier[supplierCategory] = [];
        }
        groupedBySupplier[supplierCategory].push(item);
    });

    // Sort items within each supplier group alphabetically
    for (const supplier in groupedBySupplier) {
        groupedBySupplier[supplier].sort((a, b) => a.name.localeCompare(b.name));
    }

    return { groupedOrders: groupedBySupplier, warnings };
};