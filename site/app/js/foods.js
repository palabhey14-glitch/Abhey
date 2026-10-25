// Starter food list for the meal plan builder. Numbers are per 100 g.
// src 'usda': plain foods, typical values from USDA FoodData Central.
// src 'est':  home-style South Asian dishes. Recipes vary a lot, so these are
//             estimates from typical recipes; the coach edits them per item.
// diet: 'vegan', 'veg' (vegetarian), 'fish' or 'meat'. Meat is halal only if
// it is bought halal, so the list never claims it.
(function (root) {
  'use strict';

  // [id, name, category, diet, serving label, serving grams, kcal, protein, carbs, fat, fibre, src]
  const ROWS = [
    // Curries and mains
    ['chicken-tikka', 'Chicken tikka', 'Curries & mains', 'meat', '1 plate', 150, 160, 26, 3, 5, 0.5, 'est'],
    ['tandoori-chicken', 'Tandoori chicken', 'Curries & mains', 'meat', '1 leg quarter', 150, 150, 25, 3, 4.5, 0.5, 'est'],
    ['butter-chicken', 'Butter chicken', 'Curries & mains', 'meat', '1 cup', 240, 150, 12, 6, 9, 1, 'est'],
    ['chicken-curry', 'Chicken curry, home-style', 'Curries & mains', 'meat', '1 cup', 240, 130, 13, 5, 7, 1, 'est'],
    ['chicken-biryani', 'Chicken biryani', 'Curries & mains', 'meat', '1 plate', 300, 165, 9, 20, 5.5, 1, 'est'],
    ['lamb-curry', 'Lamb curry (rogan josh)', 'Curries & mains', 'meat', '1 cup', 240, 170, 14, 5, 11, 1, 'est'],
    ['goat-curry', 'Goat curry', 'Curries & mains', 'meat', '1 cup', 240, 140, 15, 4, 7, 1, 'est'],
    ['keema', 'Keema (lean mince curry)', 'Curries & mains', 'meat', '1 cup', 200, 180, 18, 4, 10, 1, 'est'],
    ['fish-curry', 'Fish curry', 'Curries & mains', 'fish', '1 cup', 240, 110, 13, 4, 5, 1, 'est'],
    ['prawn-masala', 'Prawn masala', 'Curries & mains', 'fish', '1 cup', 200, 120, 15, 5, 5, 1, 'est'],
    ['paneer-tikka', 'Paneer tikka', 'Curries & mains', 'veg', '1 plate', 150, 230, 16, 6, 16, 1, 'est'],
    ['palak-paneer', 'Palak paneer', 'Curries & mains', 'veg', '1 cup', 240, 140, 7, 6, 10, 2, 'est'],
    ['tofu-tikka', 'Tofu tikka', 'Curries & mains', 'vegan', '1 plate', 150, 150, 15, 5, 8, 2, 'est'],
    ['soya-curry', 'Soya chunk curry', 'Curries & mains', 'vegan', '1 cup', 240, 120, 12, 9, 4, 4, 'est'],

    // Dal and legumes
    ['dal-tadka', 'Dal tadka (yellow dal)', 'Dal & legumes', 'vegan', '1 cup', 240, 110, 6, 15, 3, 4, 'est'],
    ['dal-makhani', 'Dal makhani', 'Dal & legumes', 'veg', '1 cup', 240, 160, 6, 15, 8, 5, 'est'],
    ['chana-masala', 'Chana masala', 'Dal & legumes', 'vegan', '1 cup', 240, 150, 7, 20, 5, 6, 'est'],
    ['rajma', 'Rajma (kidney bean curry)', 'Dal & legumes', 'vegan', '1 cup', 240, 120, 6, 17, 3, 6, 'est'],
    ['sambar', 'Sambar', 'Dal & legumes', 'vegan', '1 cup', 240, 65, 3, 9, 2, 2.5, 'est'],
    ['lentils', 'Lentils, boiled', 'Dal & legumes', 'vegan', '1 cup', 200, 116, 9, 20, 0.4, 7.9, 'usda'],
    ['moong', 'Mung beans, boiled', 'Dal & legumes', 'vegan', '1 cup', 200, 105, 7, 19.2, 0.4, 7.6, 'usda'],
    ['chickpeas', 'Chickpeas, boiled', 'Dal & legumes', 'vegan', '1 cup', 160, 164, 8.9, 27.4, 2.6, 7.6, 'usda'],
    ['kidney-beans', 'Kidney beans, boiled', 'Dal & legumes', 'vegan', '1 cup', 180, 127, 8.7, 22.8, 0.5, 6.4, 'usda'],

    // Rice and breads
    ['basmati', 'Basmati rice, cooked', 'Rice & breads', 'vegan', '1 cup', 160, 130, 2.7, 28.2, 0.3, 0.4, 'usda'],
    ['brown-rice', 'Brown rice, cooked', 'Rice & breads', 'vegan', '1 cup', 160, 123, 2.7, 25.6, 1, 1.6, 'usda'],
    ['jeera-rice', 'Jeera rice', 'Rice & breads', 'vegan', '1 cup', 160, 150, 3, 28, 3, 0.5, 'est'],
    ['veg-pulao', 'Veg pulao', 'Rice & breads', 'vegan', '1 cup', 180, 140, 3, 24, 3.5, 1.5, 'est'],
    ['roti', 'Roti / chapati (no ghee)', 'Rice & breads', 'vegan', '1 roti', 40, 300, 10, 48, 7, 6, 'est'],
    ['naan', 'Naan, plain', 'Rice & breads', 'veg', '1 naan', 90, 262, 8.7, 45.4, 5.1, 2.2, 'usda'],
    ['paratha', 'Paratha, plain', 'Rice & breads', 'veg', '1 paratha', 80, 320, 7, 45, 13, 5, 'est'],
    ['aloo-paratha', 'Aloo paratha', 'Rice & breads', 'veg', '1 paratha', 120, 260, 6, 36, 10, 4, 'est'],
    ['quinoa', 'Quinoa, cooked', 'Rice & breads', 'vegan', '1 cup', 185, 120, 4.4, 21.3, 1.9, 2.8, 'usda'],
    ['wholemeal-bread', 'Wholemeal bread', 'Rice & breads', 'vegan', '1 slice', 35, 252, 12.4, 42.7, 3.5, 6, 'usda'],
    ['potato', 'Potato, boiled', 'Rice & breads', 'vegan', '1 medium', 170, 87, 1.9, 20.1, 0.1, 1.8, 'usda'],
    ['sweet-potato', 'Sweet potato, baked', 'Rice & breads', 'vegan', '1 medium', 150, 90, 2, 20.7, 0.2, 3.3, 'usda'],

    // Breakfast
    ['oats', 'Rolled oats, dry', 'Breakfast', 'vegan', '1/2 cup', 40, 379, 13.2, 67.7, 6.5, 10.1, 'usda'],
    ['poha', 'Poha', 'Breakfast', 'vegan', '1 plate', 200, 130, 2.5, 23, 3.5, 1.5, 'est'],
    ['upma', 'Upma', 'Breakfast', 'vegan', '1 plate', 200, 120, 3, 18, 4, 1.5, 'est'],
    ['idli', 'Idli', 'Breakfast', 'vegan', '1 idli', 40, 100, 3.5, 21, 0.4, 1.2, 'est'],
    ['dosa', 'Dosa, plain', 'Breakfast', 'vegan', '1 dosa', 80, 165, 4, 27, 4, 1, 'est'],
    ['besan-chilla', 'Besan chilla', 'Breakfast', 'vegan', '1 chilla', 80, 190, 9, 22, 7, 4, 'est'],
    ['eggs', 'Eggs, boiled', 'Breakfast', 'veg', '2 large eggs', 100, 155, 12.6, 1.1, 10.6, 0, 'usda'],
    ['egg-whites', 'Egg whites', 'Breakfast', 'veg', '4 whites', 130, 52, 10.9, 0.7, 0.2, 0, 'usda'],
    ['masala-omelette', 'Masala omelette (2 eggs)', 'Breakfast', 'veg', '1 omelette', 130, 170, 11, 3, 13, 0.7, 'est'],

    // Protein foods
    ['chicken-breast', 'Chicken breast, cooked', 'Protein', 'meat', '1 fillet', 150, 165, 31, 0, 3.6, 0, 'usda'],
    ['chicken-thigh', 'Chicken thigh, cooked, skinless', 'Protein', 'meat', '2 thighs', 150, 179, 24.8, 0, 8.2, 0, 'usda'],
    ['salmon', 'Salmon, cooked', 'Protein', 'fish', '1 fillet', 150, 206, 22.1, 0, 12.4, 0, 'usda'],
    ['prawns', 'Prawns, cooked', 'Protein', 'fish', '1 serve', 120, 99, 24, 0.2, 0.3, 0, 'usda'],
    ['paneer', 'Paneer', 'Protein', 'veg', '100 g', 100, 265, 18, 3, 20, 0, 'est'],
    ['tofu', 'Tofu, firm', 'Protein', 'vegan', '1/2 block', 150, 144, 17.3, 2.8, 8.7, 2.3, 'usda'],
    ['soya-chunks', 'Soya chunks, dry', 'Protein', 'vegan', '1/3 cup', 30, 345, 52, 33, 0.5, 13, 'est'],
    ['whey', 'Whey protein powder', 'Protein', 'veg', '1 scoop', 30, 400, 80, 8, 6, 0, 'est'],
    ['pea-protein', 'Plant protein powder', 'Protein', 'vegan', '1 scoop', 30, 380, 75, 6, 7, 3, 'est'],

    // Veg and sides
    ['aloo-gobi', 'Aloo gobi', 'Veg & sides', 'vegan', '1 cup', 200, 95, 2.5, 11, 5, 3, 'est'],
    ['bhindi', 'Bhindi masala', 'Veg & sides', 'vegan', '1 cup', 150, 100, 2.5, 9, 6.5, 3.5, 'est'],
    ['baingan-bharta', 'Baingan bharta', 'Veg & sides', 'vegan', '1 cup', 200, 90, 2, 9, 5.5, 3.5, 'est'],
    ['saag', 'Spinach, cooked', 'Veg & sides', 'vegan', '1 cup', 180, 23, 3, 3.8, 0.3, 2.4, 'usda'],
    ['broccoli', 'Broccoli, steamed', 'Veg & sides', 'vegan', '1 cup', 150, 35, 2.4, 7.2, 0.4, 3.3, 'usda'],
    ['kachumber', 'Kachumber salad', 'Veg & sides', 'vegan', '1 bowl', 100, 25, 1, 5, 0.2, 1.5, 'est'],
    ['raita', 'Cucumber raita', 'Veg & sides', 'veg', '1/2 cup', 100, 60, 3, 5, 3, 0.5, 'est'],
    ['mint-chutney', 'Mint chutney', 'Veg & sides', 'vegan', '2 tbsp', 30, 40, 2, 7, 0.5, 2, 'est'],
    ['coconut-chutney', 'Coconut chutney', 'Veg & sides', 'vegan', '2 tbsp', 30, 200, 3, 9, 17, 4, 'est'],

    // Dairy
    ['greek-yogurt', 'Greek yogurt, plain, low fat', 'Dairy', 'veg', '1 tub', 170, 59, 10.2, 3.6, 0.4, 0, 'usda'],
    ['dahi', 'Dahi / plain yogurt', 'Dairy', 'veg', '1 bowl', 150, 61, 3.5, 4.7, 3.3, 0, 'usda'],
    ['milk', 'Milk, full cream', 'Dairy', 'veg', '1 glass', 250, 61, 3.2, 4.8, 3.3, 0, 'usda'],
    ['skim-milk', 'Milk, skim', 'Dairy', 'veg', '1 glass', 250, 34, 3.4, 5, 0.1, 0, 'usda'],
    ['soy-milk', 'Soy milk, unsweetened', 'Dairy', 'vegan', '1 glass', 250, 33, 2.9, 1.7, 1.6, 0.5, 'usda'],

    // Fruit
    ['banana', 'Banana', 'Fruit', 'vegan', '1 medium', 120, 89, 1.1, 22.8, 0.3, 2.6, 'usda'],
    ['apple', 'Apple', 'Fruit', 'vegan', '1 medium', 180, 52, 0.3, 13.8, 0.2, 2.4, 'usda'],
    ['mango', 'Mango', 'Fruit', 'vegan', '1 cup', 165, 60, 0.8, 15, 0.4, 1.6, 'usda'],
    ['berries', 'Mixed berries', 'Fruit', 'vegan', '1 cup', 150, 50, 0.8, 12, 0.3, 3, 'usda'],

    // Fats and nuts
    ['ghee', 'Ghee', 'Fats & nuts', 'veg', '1 tsp', 5, 900, 0, 0, 100, 0, 'usda'],
    ['oil', 'Cooking oil', 'Fats & nuts', 'vegan', '1 tsp', 5, 884, 0, 0, 100, 0, 'usda'],
    ['almonds', 'Almonds', 'Fats & nuts', 'vegan', '15 almonds', 20, 579, 21.2, 21.6, 49.9, 12.5, 'usda'],
    ['peanuts', 'Peanuts, roasted', 'Fats & nuts', 'vegan', '1 handful', 30, 567, 25.8, 16.1, 49.2, 8.5, 'usda'],
    ['peanut-butter', 'Peanut butter', 'Fats & nuts', 'vegan', '1 tbsp', 16, 588, 25, 20, 50, 6, 'usda'],

    // Snacks and sweets
    ['roasted-chana', 'Roasted chana', 'Snacks & sweets', 'vegan', '1 handful', 30, 370, 22, 58, 5, 17, 'est'],
    ['makhana', 'Makhana (fox nuts)', 'Snacks & sweets', 'vegan', '1 bowl', 25, 347, 9.7, 76.9, 0.1, 14.5, 'est'],
    ['dhokla', 'Dhokla', 'Snacks & sweets', 'vegan', '4 pieces', 100, 160, 6, 25, 4, 2, 'est'],
    ['samosa', 'Samosa', 'Snacks & sweets', 'vegan', '1 samosa', 100, 260, 4.5, 30, 14, 3, 'est'],
    ['gulab-jamun', 'Gulab jamun', 'Snacks & sweets', 'veg', '1 piece', 50, 300, 4, 45, 12, 0.5, 'est'],

    // Drinks
    ['masala-chai', 'Masala chai (milk, 1 tsp sugar)', 'Drinks', 'veg', '1 cup', 200, 50, 1.6, 7, 1.6, 0, 'est'],
    ['lassi', 'Sweet lassi', 'Drinks', 'veg', '1 glass', 250, 90, 3, 14, 2.5, 0, 'est'],
    ['chaas', 'Chaas (spiced buttermilk)', 'Drinks', 'veg', '1 glass', 250, 25, 1.5, 2.5, 1, 0, 'est'],
  ];

  const FOODS = ROWS.map(([id, name, cat, diet, serving, g, kcal, p, c, f, fibre, src]) => ({
    id, name, cat, diet, serving, g, src, per100: { kcal, p, c, f, fibre },
  }));
  const CATEGORIES = [...new Set(FOODS.map((x) => x.cat))];

  root.RewiredFoods = { FOODS, CATEGORIES, byId: (id) => FOODS.find((x) => x.id === id) || null };
})(typeof window !== 'undefined' ? window : globalThis);
