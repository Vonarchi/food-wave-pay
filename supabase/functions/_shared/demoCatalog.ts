import type { CatalogItem, UpsellRule } from "./orderingEngine.ts";

/**
 * The public demo menu is the built-in sample, not rows in menu_items.
 * Voice ordering validates against this same list so browse and voice share ids and prices.
 * Keep ids and prices aligned with src/data/sampleData.ts.
 */
export const DEMO_CATALOG: CatalogItem[] = [
  {
    id: "item-1",
    name: "Brisket Sandwich",
    description: "Tender smoked brisket with pickles, onions, and our signature BBQ sauce on a brioche bun",
    price: 14.99,
    category: "Popular",
    available: true,
    modifiers: [
      {
        id: "mod-1",
        name: "Add Extras",
        required: false,
        maxSelections: 5,
        options: [
          { id: "opt-1", name: "Extra Brisket", price: 5 },
          { id: "opt-2", name: "Jalapeños", price: 0.75 },
          { id: "opt-3", name: "Cheese", price: 1.5 },
          { id: "opt-4", name: "Coleslaw", price: 1 },
        ],
      },
      {
        id: "mod-2",
        name: "Sauce Level",
        required: true,
        maxSelections: 1,
        options: [
          { id: "sauce-1", name: "Light Sauce", price: 0 },
          { id: "sauce-2", name: "Regular Sauce", price: 0 },
          { id: "sauce-3", name: "Extra Sauce", price: 0 },
        ],
      },
    ],
  },
  {
    id: "item-2",
    name: "Pulled Pork Tacos",
    description: "Three soft tacos with smoked pulled pork, cilantro lime slaw, and chipotle crema",
    price: 12.99,
    category: "Popular",
    available: true,
    modifiers: [
      {
        id: "mod-3",
        name: "Tortilla Type",
        required: true,
        maxSelections: 1,
        options: [
          { id: "tort-1", name: "Flour Tortilla", price: 0 },
          { id: "tort-2", name: "Corn Tortilla", price: 0 },
        ],
      },
    ],
  },
  {
    id: "item-3",
    name: "Smoked Turkey Sandwich",
    description: "House-smoked turkey breast with avocado, bacon, and honey mustard",
    price: 13.49,
    category: "Sandwiches",
    available: true,
    modifiers: [],
  },
  {
    id: "item-4",
    name: "The Pitmaster",
    description: "Brisket, pulled pork, and smoked sausage piled high with two sauces",
    price: 18.99,
    category: "Sandwiches",
    available: true,
    modifiers: [],
  },
  {
    id: "item-5",
    name: "Brisket Plate",
    description: "Half pound of sliced brisket with two sides and Texas toast",
    price: 22.99,
    category: "Plates",
    available: true,
    modifiers: [
      {
        id: "mod-4",
        name: "Choose First Side",
        required: true,
        maxSelections: 1,
        options: [
          { id: "side-1", name: "Mac & Cheese", price: 0 },
          { id: "side-2", name: "Coleslaw", price: 0 },
          { id: "side-3", name: "Baked Beans", price: 0 },
          { id: "side-4", name: "Potato Salad", price: 0 },
        ],
      },
      {
        id: "mod-5",
        name: "Choose Second Side",
        required: true,
        maxSelections: 1,
        options: [
          { id: "side2-1", name: "Mac & Cheese", price: 0 },
          { id: "side2-2", name: "Coleslaw", price: 0 },
          { id: "side2-3", name: "Baked Beans", price: 0 },
          { id: "side2-4", name: "Potato Salad", price: 0 },
        ],
      },
    ],
  },
  {
    id: "item-6",
    name: "Ribs Half Rack",
    description: "St. Louis style ribs with dry rub, two sides, and Texas toast",
    price: 24.99,
    category: "Plates",
    available: true,
    modifiers: [],
  },
  {
    id: "item-7",
    name: "Mac & Cheese",
    description: "Creamy three-cheese mac with crispy breadcrumb topping",
    price: 5.99,
    category: "Sides",
    available: true,
    modifiers: [],
  },
  {
    id: "item-8",
    name: "Baked Beans",
    description: "Sweet and savory beans with burnt ends",
    price: 4.99,
    category: "Sides",
    available: true,
    modifiers: [],
  },
  {
    id: "item-9",
    name: "Coleslaw",
    description: "Classic creamy coleslaw",
    price: 3.99,
    category: "Sides",
    available: false,
    modifiers: [],
  },
  {
    id: "item-10",
    name: "Sweet Tea",
    description: "Southern style sweet iced tea",
    price: 2.99,
    category: "Drinks",
    available: true,
    modifiers: [
      {
        id: "mod-6",
        name: "Size",
        required: true,
        maxSelections: 1,
        options: [
          { id: "size-1", name: "Regular (16oz)", price: 0 },
          { id: "size-2", name: "Large (24oz)", price: 1 },
        ],
      },
    ],
  },
  {
    id: "item-11",
    name: "Craft Lemonade",
    description: "Fresh-squeezed lemonade with a hint of mint",
    price: 3.99,
    category: "Drinks",
    available: true,
    modifiers: [],
  },
  {
    id: "item-12",
    name: "Bottled Water",
    description: "Ice cold purified water",
    price: 1.99,
    category: "Drinks",
    available: true,
    modifiers: [],
  },
];

export const DEMO_UPSELLS: UpsellRule[] = [
  { sourceItemId: "item-1", suggestedItemId: "item-12" },
  { sourceItemId: "item-5", suggestedItemId: "item-11" },
];
