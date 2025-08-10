import { Recipe, Ingredient } from '../../hooks/useRecipes';

interface OrderItem {
    product: string;
    netQty: number; // in kg
    roundedQty: number; // in kg
    unit: string;
    supplier: string;
    deliveryDay: 'Mo' | 'Mi' | 'Fr';
    allergens: string[];
    note?: string;
}

interface AggregatedIngredient {
    totalGrams: number;
    firstUseDate: Date;
}

// Three-tier rounding logic
const smartRound = (qty: number, productName: string): number => {
    // Spices and small items
    if (qty < 0.1) return Math.ceil(qty * 100) / 100; // Round up to nearest 10g
    if (qty < 1) return Math.ceil(qty * 2) / 2; // Round up to nearest 0.5 kg
    if (qty <= 10) return Math.ceil(qty); // Round up to nearest 1 kg
    return Math.ceil(qty / 5) * 5; // Round up to nearest 5 kg
};

const getDeliveryDay = (shelfLifeDays: number, firstUseDayIndex: number): 'Mo' | 'Mi' | 'Fr' => {
    // Order for Monday if needed Mon/Tue/Wed
    if (firstUseDayIndex <= 2) return 'Mo';
    // Order for Wednesday if needed Thu/Fri
    if (firstUseDayIndex <= 4) return 'Mi';
    // Order for Friday if needed Sat/Sun
    return 'Fr';
};

export const generateOrderList = (menuData: any, recipes: Recipe[], weekDates: Date[], orderMeta: any): Record<string, OrderItem[]> => {
    const aggregatedIngredients: Record<string, AggregatedIngredient> = {};

    const findRecipe = (name: string): Recipe | undefined => {
        return recipes.find(r => r.name === name);
    };

    const addIngredients = (recipeName: string, servings: number, dayIndex: number) => {
        if (!recipeName) return;
        const recipe = findRecipe(recipeName);
        if (!recipe || !recipe.ingredients) return;

        recipe.ingredients.forEach(ingredient => {
            const date = weekDates[dayIndex];
            if (!aggregatedIngredients[ingredient.name]) {
                aggregatedIngredients[ingredient.name] = { totalGrams: 0, firstUseDate: date };
            }
            aggregatedIngredients[ingredient.name].totalGrams += ingredient.grams * servings;
            // Update firstUseDate if a new, earlier date is found
            if (date < aggregatedIngredients[ingredient.name].firstUseDate) {
                 aggregatedIngredients[ingredient.name].firstUseDate = date;
            }
        });
    };

    // 1. Aggregate all ingredients from the daily plan
    const daysOfWeek = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    daysOfWeek.forEach((day, dayIndex) => {
        const dayPlan = menuData[day];
        if (!dayPlan) return;
        const servings = dayPlan.servings || 120;
        
        addIngredients(dayPlan.mittag?.suppe, servings, dayIndex);
        addIngredients(dayPlan.mittag?.dessert, servings, dayIndex);
        addIngredients(dayPlan.mittag?.menu, servings, dayIndex);
        addIngredients(dayPlan.mittag?.vegi, servings, dayIndex);
        addIngredients(dayPlan.abend?.menu, servings, dayIndex);
        addIngredients(dayPlan.abend?.vegi, servings, dayIndex);
    });

    // 2. Handle weekly hits with more logical serving estimates
    const SERVINGS_PER_HIT_LUNCH = 20; // Estimated # of people choosing the hit for lunch per day
    const SERVINGS_PER_HIT_DINNER = 15; // Estimated # of people choosing the hit for dinner per day

    // Wochenhit Mittag 1 (Mo-Mi, 3 days)
    if (menuData.wochenhitMittag1) {
        const totalServings = SERVINGS_PER_HIT_LUNCH * 3;
        addIngredients(menuData.wochenhitMittag1, totalServings, 0); // Use Monday as first use day
    }

    // Wochenhit Mittag 2 (Do-So, 4 days)
    if (menuData.wochenhitMittag2) {
        const totalServings = SERVINGS_PER_HIT_LUNCH * 4;
        addIngredients(menuData.wochenhitMittag2, totalServings, 3); // Use Thursday as first use day
    }

    // Wochenhit Abend (Mo-So, 7 days)
    const abendHits = (menuData.wochenhitAbend || []).filter(Boolean);
    if (abendHits.length > 0) {
        const servingsPerHit = (SERVINGS_PER_HIT_DINNER * 7) / abendHits.length;
        abendHits.forEach((hitName: string) => {
            addIngredients(hitName, servingsPerHit, 0); // Use Monday as first use day for all evening hits
        });
    }

    // 3. Process aggregated list to create final order items
    const finalOrderList: OrderItem[] = [];
    for (const name in aggregatedIngredients) {
        const meta = (orderMeta as Record<string, any>)[name];
        if (!meta) {
            console.warn(`No order metadata found for: ${name}`);
            continue;
        }

        const { totalGrams, firstUseDate } = aggregatedIngredients[name];
        const netGrams = totalGrams / (meta.rawToCooked || 1.0);
        const grossGrams = netGrams / (1 - (meta.wastePct || 0) / 100);

        let finalGrams = grossGrams;
        let note: string | undefined = undefined;
        if (meta.shelfLifeDays < 3) {
            finalGrams *= 1.05; // 5% buffer for freezing
            note = 'Bei Ankunft einfrieren';
        }

        const netKg = finalGrams / 1000;
        const roundedKg = smartRound(netKg, name);
        
        const firstUseDayIndex = firstUseDate.getDay() === 0 ? 6 : firstUseDate.getDay() - 1;

        finalOrderList.push({
            product: name,
            netQty: parseFloat(netKg.toFixed(3)),
            roundedQty: roundedKg,
            unit: 'kg',
            supplier: meta.supplier,
            deliveryDay: getDeliveryDay(meta.shelfLifeDays, firstUseDayIndex),
            allergens: meta.allergens || [],
            note,
        });
    }

    // 4. Group by supplier category
    const groupedBySupplier: Record<string, OrderItem[]> = {};
    finalOrderList.forEach(item => {
        if (!groupedBySupplier[item.supplier]) {
            groupedBySupplier[item.supplier] = [];
        }
        groupedBySupplier[item.supplier].push(item);
    });

    // Sort items within each supplier group
    for (const supplier in groupedBySupplier) {
        groupedBySupplier[supplier].sort((a, b) => a.product.localeCompare(b.product));
    }

    return groupedBySupplier;
};