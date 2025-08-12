export const STORAGE_KEY = 'kaeppeli-menu-plans';

export const SUPPLIERS: { [key: string]: { address: string; phone: string; email: string; categories: string[]; } } = {
    "Safruits AG für Fruchthandel": {
        address: "Aliothstrasse 32, 4142 Münchenstein",
        phone: "+41 61 225 12 12",
        email: "info@safruits.com",
        categories: ["Gemüse & Früchte", "Molkereiprodukte"]
    },
    "Saviva Grosshandel": {
        address: "Industriestrasse 1, 5505 Brunegg",
        phone: "+41 44 870 82 00",
        email: "info@saviva.ch",
        categories: ["Trockenwaren & Kolonial", "Tiefkühlprodukte"]
    },
    "Bernet AG - Metzgerei": {
        address: "Hauptstrasse 17, 4324 Obermumpf",
        phone: "+41 62 866 40 20",
        email: "info@bernet-metzgerei.ch",
        categories: ["Metzgerei"]
    },
    "Bäckerei Gaugler AG": {
        address: "Netzibodenstrasse 23c, 4133 Pratteln",
        phone: "+41 61 811 10 08",
        email: "augst@gauglerbrot.ch",
        categories: ["Bäckerei"]
    }
};

export const createEmptyWeekPlan = () => {
    const days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const plan: any = {
        wochenhitMittag1: '',
        wochenhitMittag2: '',
        wochenhitAbend: ['', '', '', ''],
    };
    days.forEach(day => {
        plan[day] = {
            servings: 120,
            mittag: { suppe: '', dessert: '', menu: '', vegi: '' },
            abend: { menu: '', vegi: '' }
        };
    });
    return plan;
};