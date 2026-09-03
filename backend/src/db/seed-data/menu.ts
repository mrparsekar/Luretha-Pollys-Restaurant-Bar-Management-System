import type { menuGroup } from '../schema.js'

/**
 * The printed menu, transcribed from the 13 photographs in ./Menu.
 *
 * Prices are written in RUPEES here because that is what the owner will check
 * against the physical menu; the seeder multiplies by 100 on the way into the
 * database, where everything is paise.
 *
 * Four shapes come straight off the printed card and drive the data model:
 *
 *  - variant pricing   spirits 30ml/60ml, wine glass/bottle, tea small/cup/pot,
 *                      ice cream by the scoop, schezwan rice/noodles veg/chicken
 *  - ask               the 11 Seafood items are printed "ask for price"
 *  - time gates        Beef Steak and Pre Cut Beef Steak are 7pm-10pm only
 *  - no price          Urrack is seasonal
 *
 * Sizes the kitchen does not serve (green tea "small", hot milk "small") are
 * printed as "--" and are simply absent here.
 *
 * Spellings are kept exactly as printed - "Cheken Macaroni", "Calamri Golden
 * Fry", "Mackreal Racheado", "Pollus Special Salad". The owner signs these off
 * on the price verification sheet, and fixing them there is one tap.
 */

type Group = (typeof menuGroup)['enumValues'][number]

export type SeedVariant = { label: string; rupees: number | null }

export type SeedItem = {
  name: string
  desc?: string
  /** Fixed price. Omit when the item uses variants or is ask-for-price. */
  rupees?: number
  /** Printed without a price: the waiter keys it in at order time. */
  ask?: boolean
  variants?: SeedVariant[]
  veg?: boolean
  /** 24h "HH:MM"; both ends set means the item is only served in that window. */
  from?: string
  to?: string
  note?: string
}

export type SeedCategory = {
  name: string
  group: Group
  note?: string
  items: SeedItem[]
}

/** Tea and coffee are printed as three sizes across. */
function sizes(name: string, small: number | null, cup: number, pot: number): SeedItem {
  const variants: SeedVariant[] = []
  if (small !== null) variants.push({ label: 'Small', rupees: small })
  variants.push({ label: 'Cup', rupees: cup }, { label: 'Pot', rupees: pot })
  return { name, veg: true, variants }
}

/** Spirits are printed as a 30ml/60ml pair. */
function peg(name: string, ml30: number, ml60: number): SeedItem {
  return { name, variants: [{ label: '30ml', rupees: ml30 }, { label: '60ml', rupees: ml60 }] }
}

/** Wine is printed by the glass and by the bottle. */
function wine(name: string, glass: number, bottle: number): SeedItem {
  return { name, variants: [{ label: 'Glass', rupees: glass }, { label: 'Bottle', rupees: bottle }] }
}

/** Ice cream is printed as one scoop / two scoops. */
function scoops(name: string, one: number, two: number): SeedItem {
  return {
    name,
    veg: true,
    variants: [{ label: '1 scoop', rupees: one }, { label: '2 scoops', rupees: two }],
  }
}

/** Noodle soup, schezwan rice and schezwan noodles are printed veg/chicken. */
function vegOrChicken(name: string, veg: number, chicken: number): SeedItem {
  return { name, variants: [{ label: 'Veg', rupees: veg }, { label: 'Chicken', rupees: chicken }] }
}

export const SEED_MENU: SeedCategory[] = [
  // ---------------------------------------------------------------- breakfast
  {
    name: 'Egg Counter',
    group: 'breakfast',
    note: 'All egg preparations are 2 eggs, served with toast.',
    items: [
      { name: 'Fried Egg', rupees: 80, veg: false },
      { name: 'Boiled Egg', rupees: 70, veg: false },
      { name: 'Poached Egg', rupees: 100, veg: false },
      { name: 'Plain Omlette', rupees: 80, veg: false },
      { name: 'Masala Omlette', rupees: 90, veg: false },
      { name: 'Cheese Masala Omlette', rupees: 140, veg: false },
      { name: 'Cheese Omlette', rupees: 120, veg: false },
      { name: 'Cheese Tomato Omlette', rupees: 130, veg: false },
      { name: 'Mushroom Omlette', rupees: 120, veg: false },
      { name: 'Mushroom Cheese Omlette', rupees: 150, veg: false },
      { name: 'Bacon Cheese Omlette', rupees: 250, veg: false },
      { name: 'Scrambled Egg', rupees: 120, veg: false },
      { name: 'Masala Scramble', desc: 'egg bhurji', rupees: 140, veg: false },
      { name: 'Spanish Omlette', desc: '3 eggs', rupees: 200, veg: false },
      { name: 'Fried Eggs & Beans', rupees: 140, veg: false },
      { name: 'Fried Eggs & Chicken Sausage', rupees: 240, veg: false },
      { name: 'Fried Egg, Beans & Bacon', rupees: 300, veg: false },
      { name: 'Fried Egg, Beans & Mushroom', rupees: 200, veg: false },
    ],
  },
  {
    name: 'Breakfast Plates',
    group: 'breakfast',
    items: [
      {
        name: 'Full English Breakfast',
        desc: '2 eggs, bacon, chicken sausage, baked beans, mushroom, tomato',
        rupees: 400,
        veg: false,
      },
      {
        name: 'Luretha Special Breakfast',
        desc: '2 eggs, chicken sausage, Goan chorizo, fruits, baked beans',
        rupees: 430,
        veg: false,
      },
      { name: 'Aloo Paratha', rupees: 120, veg: true },
    ],
  },
  {
    name: 'Pancakes',
    group: 'breakfast',
    items: [
      { name: 'Plain Pancake', rupees: 100, veg: true },
      { name: 'Banana Pancake', rupees: 120, veg: true },
      { name: 'Mix Fruits Pancake', rupees: 150, veg: true },
      { name: 'Nutella Pancake', rupees: 180, veg: true },
      { name: 'Banana Nutella Pancake', rupees: 220, veg: true },
      { name: 'Banana Strawberry Nutella Pancake', rupees: 250, veg: true },
      { name: 'Strawberry Nutella Pancake', rupees: 240, veg: true },
      { name: 'Biscoff Pancake', rupees: 220, veg: true },
      { name: 'Chocolate Pancake', rupees: 140, veg: true },
      { name: 'Chocolate Banana Pancake', rupees: 160, veg: true },
      { name: 'Coconut Pancake', rupees: 140, veg: true },
      { name: 'Chocolate Coconut Pancake', rupees: 160, veg: true },
      { name: 'Cheese Pancake', rupees: 140, veg: true },
      { name: 'Scrambled Egg Pancake', rupees: 150, veg: false },
    ],
  },
  {
    name: 'Breakfast Extras',
    group: 'breakfast',
    items: [
      { name: 'Plate of Fried Chicken Sausages', rupees: 350, veg: false },
      { name: 'Plate of Fried Bacon', rupees: 350, veg: false },
    ],
  },
  {
    name: 'Toast',
    group: 'breakfast',
    items: [
      { name: 'Plain Bread Toast', rupees: 10, veg: true },
      { name: 'Butter Toast', rupees: 60, veg: true },
      { name: 'Peanut Butter Toast', rupees: 80, veg: true },
      { name: 'Jam Toast', rupees: 70, veg: true },
      { name: 'Nutella Toast', desc: 'slice bread', rupees: 150, veg: true },
      { name: 'Cheese Toast', rupees: 90, veg: true },
      { name: 'Chilli Cheese Toast', rupees: 100, veg: true },
      { name: 'Egg Toast', rupees: 50, veg: false },
      { name: 'French Toast', rupees: 120, veg: false },
      { name: 'Baked Beans on Toast', rupees: 120, veg: true },
      { name: 'Ham & Cheese Toast', rupees: 200, veg: false },
    ],
  },
  {
    name: 'Sandwiches',
    group: 'breakfast',
    items: [
      { name: 'Vegetable Sandwich', rupees: 100, veg: true },
      { name: 'Vegetable Cheese Sandwich', rupees: 130, veg: true },
      { name: 'Cheese Butter Garlic Sandwich', rupees: 120, veg: true },
      { name: 'Cheese Onion Tomato Sandwich', rupees: 100, veg: true },
      { name: 'Cheese Egg Onion Tomato Sandwich', rupees: 130, veg: false },
      { name: 'Cheese Onion Garlic Tomato Sandwich', rupees: 130, veg: true },
      { name: 'Chicken Cheese Sandwich', rupees: 180, veg: false },
      { name: 'Beef Onion Tomato', rupees: 200, veg: false },
      { name: 'Roast Beef Sandwich', rupees: 250, veg: false },
      { name: 'Beef Mac', rupees: 250, veg: false },
      { name: 'Chicken Mac', rupees: 230, veg: false },
      { name: 'Bacon & Cheese Sandwich', rupees: 200, veg: false },
      { name: 'Chicken Tikka Sandwich', rupees: 200, veg: false },
      { name: 'Veg Club Sandwich', rupees: 200, veg: true },
      {
        name: 'Non Veg Club Sandwich',
        desc: 'chicken, pork ham, egg, cheese, onion, tomato',
        rupees: 260,
        veg: false,
      },
    ],
  },
  {
    name: 'Something Healthy',
    group: 'breakfast',
    items: [
      { name: 'Plain Cornflakes', rupees: 100, veg: true },
      { name: 'Cornflakes with Fruits', rupees: 140, veg: true },
      { name: 'Muesli', desc: 'milk / curd', rupees: 150, veg: true },
      { name: 'Plain Porridge', rupees: 120, veg: true },
      { name: 'Banana Porridge', rupees: 140, veg: true },
      { name: 'Mixed Fruits Porridge', rupees: 160, veg: true },
      { name: 'Coconut Porridge', rupees: 160, veg: true },
      { name: 'Fruit Salad', rupees: 140, veg: true },
      { name: 'Fruit Salad with Curd', rupees: 160, veg: true },
      { name: 'Fruit Salad with Curd & Coconut', rupees: 200, veg: true },
      { name: 'Fruit Salad with Ice Cream', rupees: 170, veg: true },
      { name: 'Fruit Salad with Curd & Muesli', rupees: 230, veg: true },
    ],
  },
  // ---------------------------------------------------------------- beverages
  {
    name: 'Tea',
    group: 'beverage',
    items: [
      sizes('Black Tea', 20, 30, 60),
      sizes('Lemon Tea', 30, 40, 70),
      sizes('Ginger Lemon Tea', 40, 60, 90),
      sizes('Ginger Black Tea', 30, 50, 80),
      sizes('Milk Tea', 30, 50, 80),
      sizes('Cardamon Tea', 40, 70, 110),
      sizes('Masala Tea', 40, 80, 120),
      sizes('Ginger Milk Tea', 40, 70, 110),
      // Printed with no "small" size.
      sizes('Green Tea', null, 70, 100),
    ],
  },
  {
    name: 'Coffee',
    group: 'beverage',
    items: [
      sizes('Black Nescafe', 30, 60, 90),
      sizes('Milk Nescafe', 40, 80, 120),
      sizes('Bru Black Coffee', 30, 60, 90),
      sizes('Bru Milk Coffee', 40, 80, 120),
      sizes('Local Black Coffee', 30, 60, 90),
      sizes('Local Milk Coffee', 40, 80, 120),
      sizes('Hot Milk', null, 40, 80),
      sizes('Hot Chocolate', 40, 80, 120),
    ],
  },
  {
    name: 'Fresh Juices',
    group: 'beverage',
    items: [
      { name: 'Orange Juice', rupees: 140, veg: true },
      { name: 'Pineapple Juice', rupees: 130, veg: true },
      { name: 'Watermelon Juice', rupees: 130, veg: true },
      { name: 'Papaya Juice', rupees: 130, veg: true },
      { name: 'Mango Juice', rupees: 180, veg: true },
      { name: 'Mixed Fruits Juice', rupees: 160, veg: true },
    ],
  },
  {
    name: 'Lassi',
    group: 'beverage',
    items: [
      { name: 'Plain Lassi', rupees: 80, veg: true },
      { name: 'Salted Lassi', rupees: 100, veg: true },
      { name: 'Sweet Lassi', rupees: 100, veg: true },
      { name: 'Banana Lassi', rupees: 120, veg: true },
      { name: 'Papaya Lassi', rupees: 120, veg: true },
      { name: 'Mango Lassi', rupees: 180, veg: true },
      { name: 'Mixed Fruit Lassi', rupees: 160, veg: true },
      { name: 'Strawberry Lassi', rupees: 180, veg: true },
    ],
  },
  {
    name: 'Milkshakes',
    group: 'beverage',
    items: [
      { name: 'Banana Milkshake', rupees: 90, veg: true },
      { name: 'Papaya Milkshake', rupees: 90, veg: true },
      { name: 'Mango Milkshake', rupees: 180, veg: true },
      { name: 'Strawberry Milkshake', rupees: 180, veg: true },
      { name: 'Chocolate Milkshake', rupees: 130, veg: true },
      { name: 'Cold Coffee', rupees: 130, veg: true },
      { name: 'Nutella Milkshake', rupees: 180, veg: true },
      { name: 'Cold Chocolate with Ice Cream', rupees: 170, veg: true },
      { name: 'Cold Coffee with Ice Cream', rupees: 170, veg: true },
      { name: 'Cold Bournvita', rupees: 130, veg: true },
      { name: 'Peanut Butter Milkshake', rupees: 160, veg: true },
    ],
  },
  {
    name: 'Something Cool',
    group: 'beverage',
    items: [
      {
        name: 'Soft Drink',
        desc: '300ml',
        veg: true,
        variants: [
          { label: 'Coke', rupees: 40 },
          { label: 'Pepsi', rupees: 40 },
          { label: '7up', rupees: 40 },
          { label: 'Dew', rupees: 40 },
          { label: 'Limca', rupees: 40 },
          { label: 'Mirinda', rupees: 40 },
        ],
      },
      { name: 'Soda', desc: '300ml', rupees: 20, veg: true },
      { name: 'Diet Coke', rupees: 90, veg: true },
      { name: 'Aquafina Water 1L', rupees: 30, veg: true },
      { name: 'Aquafina Water 500ml', rupees: 20, veg: true },
      { name: 'Lemon Soda', rupees: 80, veg: true },
      { name: 'Lemon Water', rupees: 80, veg: true },
      { name: 'Kokum Soda', rupees: 100, veg: true },
      { name: 'Vimto', rupees: 80, veg: true },
      { name: 'Tonic Water', rupees: 110, veg: true },
      { name: 'Ginger Ale', rupees: 110, veg: true },
      { name: 'Red Bull', rupees: 180, veg: true },
      {
        name: 'Pet Bottle 750ml',
        veg: true,
        variants: [
          { label: 'Coke', rupees: 80 },
          { label: 'Sprite', rupees: 80 },
          { label: 'Limca', rupees: 80 },
        ],
      },
      { name: 'Canned Juice Glass', rupees: 80, veg: true },
    ],
  },
  {
    name: 'Mocktails',
    group: 'beverage',
    items: [
      { name: 'Virgin Mojito', desc: 'mint, lime, 7up, sugar', rupees: 180, veg: true },
      { name: 'Watermelon Mojito', desc: 'mint, lime, watermelon, 7up', rupees: 200, veg: true },
      { name: 'Cinderella', desc: 'mint, lime, pomegranate juice, 7up', rupees: 180, veg: true },
      {
        name: "Luretha's Kokum Bliss",
        desc: 'mint, lime, kokum syrup, 7up',
        rupees: 180,
        veg: true,
      },
    ],
  },
  // --------------------------------------------------------------------- food
  {
    name: 'Starters',
    group: 'food',
    items: [
      { name: 'French Fries', rupees: 150, veg: true },
      { name: 'Chilly Garlic Fries', rupees: 200, veg: true },
      { name: 'Cheesy Fries', rupees: 280, veg: true },
      { name: 'Cheesy Fries with Spicy Beef', rupees: 380, veg: false },
      { name: 'Cheesy Fries with Spiced Chicken', rupees: 360, veg: false },
      { name: 'Nachos with Spicy Beef', rupees: 380, veg: false },
      { name: 'Mushroom Butter Garlic', rupees: 250, veg: true },
      { name: 'Creamy Spiced Mushroom', rupees: 270, veg: true },
      { name: 'Chicken Lolipop', desc: '6 pcs', rupees: 270, veg: false },
      { name: 'Crispy Chicken', rupees: 300, veg: false },
      { name: 'BBQ Chicken Wings', rupees: 270, veg: false },
      { name: 'Spicy Chicken Wings', rupees: 270, veg: false },
      { name: 'Fried Chicken Wings', rupees: 270, veg: false },
      { name: 'Pan Fried Chicken Tikka', rupees: 350, veg: false },
      { name: 'Lemon Pepper Chicken', rupees: 350, veg: false },
      { name: 'Chicken Dry Fry', rupees: 350, veg: false },
      { name: 'Chicken Chilly', desc: 'Goan', rupees: 330, veg: false },
      { name: 'Chicken Chilly', desc: 'Chinese', rupees: 300, veg: false },
      { name: 'Chicken Manchurian', rupees: 300, veg: false },
      { name: 'Paneer Chilly', desc: 'Chinese', rupees: 270, veg: true },
      { name: 'Tomato Tuna Bruschetta', rupees: 270, veg: false },
    ],
  },
  {
    name: 'Beef & Pork',
    group: 'food',
    items: [
      { name: 'Beef Stir Fry', rupees: 400, veg: false },
      { name: 'Beef Chilly', rupees: 400, veg: false },
      { name: 'Pork Chilly', rupees: 400, veg: false },
      { name: 'Beef Roast', rupees: 400, veg: false },
      { name: 'Chilli Garlic Beef', rupees: 400, veg: false },
      { name: 'Beef Andrew Style', rupees: 400, veg: false },
      { name: 'Pork Andrew Style', rupees: 400, veg: false },
      { name: 'Goan Pork Sausages', rupees: 330, veg: false },
      { name: 'Beef Tongue Roasted', rupees: 400, veg: false },
      { name: 'Beef Tongue Andrew Style', rupees: 400, veg: false },
    ],
  },
  {
    name: 'Rolls',
    group: 'food',
    items: [
      { name: 'Beef Roll', rupees: 180, veg: false },
      { name: 'Chicken Tikka Roll', rupees: 180, veg: false },
      { name: 'Cheese Egg Paratha Roll', rupees: 140, veg: false },
      { name: 'Egg Roll', rupees: 100, veg: false },
    ],
  },
  {
    name: 'Salads',
    group: 'food',
    items: [
      { name: 'Vegetable Salad', rupees: 140, veg: true },
      { name: 'Pollus Special Salad', rupees: 170 },
      { name: 'Grilled Chicken Salad', rupees: 350, veg: false },
      {
        name: 'Chicken Caesar Salad',
        desc: 'croutons, bacon, chicken, egg',
        rupees: 350,
        veg: false,
      },
      {
        name: 'Prawns Caesar Salad',
        desc: 'croutons, bacon, prawns, egg',
        rupees: 350,
        veg: false,
      },
      { name: 'Tuna Salad', rupees: 400, veg: false },
      { name: 'Seafood Salad', rupees: 400, veg: false },
      { name: 'Cheese Egg Salad', rupees: 300, veg: false },
    ],
  },
  {
    name: 'Goan Poie',
    group: 'food',
    items: [
      { name: 'Goan Choris Poie', rupees: 160, veg: false },
      { name: 'Beef Chilly Poie', rupees: 160, veg: false },
      { name: 'Beef Tongue Poie', rupees: 160, veg: false },
      { name: 'Pork Chilly Poie', rupees: 160, veg: false },
    ],
  },
  {
    name: 'Soups',
    group: 'food',
    items: [
      { name: 'Vegetable Soup', rupees: 140, veg: true },
      { name: 'Dal Soup', rupees: 140, veg: true },
      { name: 'Cream of Mushroom Soup', rupees: 140, veg: true },
      { name: 'Tomato Soup', rupees: 140, veg: true },
      { name: 'Tomato Egg Soup', rupees: 150, veg: false },
      { name: 'Chicken Soup', rupees: 150, veg: false },
      vegOrChicken('Noodles Soup', 140, 160),
      { name: 'Chicken Manchow Soup', rupees: 160, veg: false },
      { name: 'Seafood Soup', rupees: 170, veg: false },
    ],
  },
  {
    name: 'Seafood',
    group: 'food',
    note: 'Check for availability. Ask for price before placing your order. Served with salad or chips.',
    items: [
      { name: 'Fried Prawns', ask: true, veg: false },
      { name: 'Prawns Butter Garlic', ask: true, veg: false },
      { name: 'Calamari Butter Garlic', ask: true, veg: false },
      { name: 'Calamari Peri Peri', ask: true, veg: false },
      { name: 'Prawns Peri Peri', ask: true, veg: false },
      { name: 'Rawa Fried Prawns', ask: true, veg: false },
      { name: 'Calamri Golden Fry', ask: true, veg: false },
      { name: 'Prawns Golden Fry', ask: true, veg: false },
      { name: 'Fried Shark', ask: true, veg: false },
      { name: 'Chonak Rawa Fry', ask: true, veg: false },
      { name: 'Mackreal Racheado', ask: true, veg: false },
    ],
  },
  {
    name: 'Our Special',
    group: 'food',
    items: [
      { name: 'Luretha Special Chicken Steak with Mashed Potato', rupees: 400, veg: false },
      { name: 'Cheesy Chicken Steak with Mashed Potato', rupees: 480, veg: false },
      {
        name: 'Beef Steak with Mashed Potato',
        rupees: 600,
        veg: false,
        from: '19:00',
        to: '22:00',
        note: 'Served from 7pm to 10pm only',
      },
      { name: 'Roast Beef with Mashed Potato', rupees: 480, veg: false },
      {
        name: 'Chicken Cafreal',
        desc: 'boneless, served with salad & poie',
        rupees: 450,
        veg: false,
      },
      {
        name: 'Pre Cut Beef Steak with Mashed Potato',
        rupees: 600,
        veg: false,
        from: '19:00',
        to: '22:00',
        note: 'Served from 7pm to 10pm only',
      },
    ],
  },
  {
    name: 'Chapati',
    group: 'food',
    items: [
      { name: 'Plain Chapati', rupees: 30, veg: true },
      { name: 'Butter Chapati', rupees: 60, veg: true },
      { name: 'Cheese Chapati', rupees: 120, veg: true },
      { name: 'Cheese Garlic Chapati', rupees: 140, veg: true },
      { name: 'Cheese Chilli Garlic Chapati', rupees: 160, veg: true },
      { name: 'Garlic Chapati', rupees: 80, veg: true },
      { name: 'Plain Paratha', rupees: 30, veg: true },
    ],
  },
  {
    name: 'Rice',
    group: 'food',
    items: [
      { name: 'Steam Rice', rupees: 80, veg: true },
      { name: 'Jeera Rice', rupees: 100, veg: true },
      { name: 'Vegetable Fried Rice', rupees: 200, veg: true },
      { name: 'Egg Fried Rice', rupees: 220, veg: false },
      { name: 'Chicken Fried Rice', rupees: 240, veg: false },
      { name: 'Prawns Fried Rice', rupees: 260, veg: false },
      {
        name: 'Mixed Fried Rice',
        desc: 'veg, egg, chicken, prawns',
        rupees: 280,
        veg: false,
      },
      { name: 'Beef Fried Rice', rupees: 300, veg: false },
      { name: 'Pork Fried Rice', rupees: 300, veg: false },
      { name: 'Chicken Biryani', rupees: 270, veg: false },
      { name: 'Egg Biryani', rupees: 250, veg: false },
      { name: 'Beef Biryani', rupees: 320, veg: false },
      { name: 'Sausage Pulao', rupees: 300, veg: false },
      vegOrChicken('Schezwan Fried Rice', 240, 260),
    ],
  },
  {
    name: 'Noodles',
    group: 'food',
    items: [
      { name: 'Vegetable Noodles', rupees: 200, veg: true },
      { name: 'Egg Noodles', rupees: 220, veg: false },
      { name: 'Chicken Noodles', rupees: 240, veg: false },
      { name: 'Prawns Noodles', rupees: 260, veg: false },
      { name: 'Mixed Noodles', desc: 'veg, egg, chicken, prawns', rupees: 280, veg: false },
      { name: 'Beef Noodles', rupees: 300, veg: false },
      vegOrChicken('Schezwan Noodles', 240, 260),
      { name: 'Maggie Noodles', rupees: 70, veg: true },
      { name: 'Cheese Maggie Noodles', rupees: 100, veg: true },
    ],
  },
  {
    name: 'Pastas',
    group: 'food',
    items: [
      { name: 'Cheken Macaroni', rupees: 230, veg: false },
      { name: 'Chicken Cheese Macaroni', rupees: 260, veg: false },
      { name: 'Vegetable Macaroni', rupees: 230, veg: true },
      { name: 'Bacon Cheese Macaroni', desc: 'white sauce', rupees: 320, veg: false },
      { name: 'Pasta Fungi', desc: 'mushroom in white sauce', rupees: 260, veg: true },
      { name: 'Pasta Carbonara', desc: 'bacon in white sauce', rupees: 350, veg: false },
      { name: 'Seafood Pasta', desc: 'red or white sauce', rupees: 350, veg: false },
      { name: 'Chicken Cheese Pasta', desc: 'white sauce', rupees: 300, veg: false },
      { name: 'Cheese Spaghetti', desc: 'white sauce', rupees: 250, veg: true },
      { name: 'Chicken Cheese Spaghetti', desc: 'white sauce', rupees: 300, veg: false },
      { name: 'Spaghetti Bolognese', desc: 'beef in red sauce', rupees: 350, veg: false },
    ],
  },
  {
    name: 'Gravy (Veg)',
    group: 'food',
    items: [
      { name: 'Dal Fry / Dal Tadka', rupees: 220, veg: true },
      { name: 'Dal Palak', rupees: 240, veg: true },
      { name: 'Palak Paneer', rupees: 250, veg: true },
      { name: 'Mix Veg Masala', rupees: 250, veg: true },
      { name: 'Paneer Masala', rupees: 270, veg: true },
      { name: 'Paneer Makhani', rupees: 300, veg: true },
      { name: 'Aloo Gobi', rupees: 250, veg: true },
      { name: 'Gobi Manchurian', desc: 'dry / gravy', rupees: 270, veg: true },
    ],
  },
  {
    name: 'Gravy (Non Veg)',
    group: 'food',
    items: [
      { name: 'Egg Masala', rupees: 240, veg: false },
      { name: 'Chicken Masala', rupees: 280, veg: false },
      { name: 'Butter Chicken', rupees: 320, veg: false },
      { name: 'Chicken Tikka Masala', rupees: 320, veg: false },
      { name: 'Prawn Masala', rupees: 350, veg: false },
      { name: 'Chicken Chilly Gravy', desc: 'chinese', rupees: 290, veg: false },
      { name: 'Chicken Manchurian Gravy', rupees: 290, veg: false },
      { name: 'Beef Masala', rupees: 350, veg: false },
    ],
  },
  {
    name: 'Goan Special',
    group: 'food',
    items: [
      { name: 'Mushroom Xacuti & Rice', rupees: 280, veg: true },
      { name: 'Vegetable Curry & Rice', rupees: 260, veg: true },
      { name: 'Egg Curry & Rice', rupees: 280, veg: false },
      { name: 'Chicken Curry & Rice', rupees: 300, veg: false },
      { name: 'Chicken Xacuti & Rice', rupees: 330, veg: false },
      { name: 'Chicken Vindaloo & Rice', rupees: 350, veg: false },
      { name: 'Fish Curry & Rice', rupees: 280, veg: false },
      { name: 'Prawns Curry & Rice', rupees: 350, veg: false },
      { name: 'Beef Curry & Rice', rupees: 350, veg: false },
      { name: 'Beef Xacuti & Rice', rupees: 380, veg: false },
      { name: 'Beef Vindaloo & Rice', rupees: 380, veg: false },
      { name: 'Pork Vindaloo & Rice', rupees: 380, veg: false },
    ],
  },
  {
    name: 'Specials & Sides',
    group: 'food',
    items: [
      { name: 'Boiled Vegetable', rupees: 150, veg: true },
      { name: 'Fried Vegetable', rupees: 200, veg: true },
      { name: 'Mashed Potato', rupees: 160, veg: true },
      { name: 'Mashed Potato with Onion', rupees: 180, veg: true },
      { name: 'Mashed Potato with Cheese', rupees: 200, veg: true },
      { name: 'Mashed Potato with Cheese & Onion', rupees: 220, veg: true },
      { name: 'Mashed Potato with Spicy Beef & Egg', rupees: 300, veg: false },
      { name: 'Fried Potato', rupees: 200, veg: true },
      { name: 'Fried Potato with Cheese', rupees: 240, veg: true },
      { name: 'Fried Potato with Onion & Cheese', rupees: 260, veg: true },
      { name: 'Fried Eggs with Fried Potato', rupees: 200, veg: false },
      { name: 'Fried Eggs with Mashed Potato', rupees: 180, veg: false },
      { name: 'Eggs & Chips', rupees: 180, veg: false },
      { name: 'Curd', rupees: 40, veg: true },
      { name: 'Raita', rupees: 90, veg: true },
      { name: 'Papad', desc: 'roasted / fried', rupees: 50, veg: true },
      { name: 'Masala Papad', rupees: 100, veg: true },
    ],
  },
  // ----------------------------------------------------------------- desserts
  {
    name: 'Desserts',
    group: 'dessert',
    items: [
      scoops('Vanilla Ice Cream', 60, 100),
      scoops('Strawberry Ice Cream', 60, 100),
      scoops('Mango Ice Cream', 80, 130),
      scoops('Chocolate Ice Cream', 90, 140),
      { name: 'Matka Kulfi', rupees: 120, veg: true },
      { name: 'Brownie', rupees: 180, veg: true },
      { name: 'Brownie with Ice Cream', rupees: 240, veg: true },
      { name: 'Bowl of Happiness', rupees: 280, veg: true },
      { name: 'Banana Fritters', rupees: 160, veg: true },
      { name: 'Banana Fritters with Ice Cream', rupees: 200, veg: true },
    ],
  },
  // ---------------------------------------------------------------------- bar
  {
    name: 'Pint Beers',
    group: 'bar',
    items: [
      { name: 'Kingfisher', rupees: 100 },
      { name: 'Tuborg', rupees: 100 },
      { name: 'Budweiser', rupees: 130 },
      { name: 'Heineken Silver', rupees: 140 },
      { name: 'Peoples Goa Beer', rupees: 160 },
      { name: 'Corona', rupees: 180 },
      { name: 'Kingfisher Ultra', rupees: 120 },
      { name: 'Carlsberg Smooth', rupees: 120 },
    ],
  },
  {
    name: 'Large Beer',
    group: 'bar',
    items: [
      { name: 'Kingfisher', rupees: 170 },
      { name: 'Kingfisher Strong', rupees: 180 },
    ],
  },
  {
    name: 'Vodka',
    group: 'bar',
    items: [
      peg('Romanov Vodka', 40, 80),
      peg('Smirnoff Vodka Original', 80, 140),
      peg('Smirnoff Vodka Green Apple', 80, 140),
      peg('Smirnoff Vodka Minty Jamun', 80, 140),
    ],
  },
  {
    name: 'Gin',
    group: 'bar',
    items: [
      peg('Blue Riband', 50, 90),
      peg('Greater Than Gin', 100, 180),
      peg('Seger Gin', 130, 220),
      peg('Satiwa Gin', 160, 270),
      peg('Pink Gin Samsara', 180, 320),
    ],
  },
  {
    name: 'Whiskey',
    group: 'bar',
    items: [
      peg('Royal Stag', 60, 90),
      peg('Imperial Blue', 60, 90),
      peg('Blenders Pride', 80, 140),
      peg('Blenders Pride Reserve', 100, 160),
      peg('Black & White', 130, 220),
      peg('Teachers Highland Cream', 140, 240),
      peg('Dewars White Label', 130, 220),
      peg('JW Black Label', 250, 470),
      peg('Jamesons', 200, 370),
    ],
  },
  {
    name: 'Rum',
    group: 'bar',
    items: [
      peg('Old Monk', 40, 80),
      peg('Old Monk Coffee', 70, 140),
      peg('Mcdowell White Rum', 50, 90),
      peg('Cabo Coconut Rum', 90, 180),
      peg('Bacardi White Casa Blanc', 80, 140),
      peg('Bacardi Black', 50, 90),
    ],
  },
  {
    name: 'Brandy',
    group: 'bar',
    items: [peg('Honey Bee', 40, 80), peg('Mansion House', 50, 100), peg('Morpheus', 70, 140)],
  },
  {
    name: 'Wine',
    group: 'bar',
    items: [
      wine('Port Wine', 90, 300),
      wine('Dia (Red/White)', 250, 800),
      wine('Big Banyan (Red/White)', 400, 1400),
      wine('Fratelli (White)', 400, 1400),
    ],
  },
  {
    name: 'Breezer',
    group: 'bar',
    items: [
      {
        name: 'Breezer',
        variants: [
          { label: 'Cranberry', rupees: 180 },
          { label: 'Watermelon', rupees: 180 },
          { label: 'Jamaica', rupees: 180 },
        ],
      },
    ],
  },
  {
    name: 'Daddy Special',
    group: 'bar',
    items: [
      { name: 'Cold Coffee with Rum', rupees: 170 },
      { name: 'Cold Coffee with Honey Bee', rupees: 170 },
      { name: 'Hot Coffee + Honey Bee', rupees: 150 },
      { name: 'Cold Coffee with Rum & Ice Cream', rupees: 220 },
      { name: 'Cold Chocolate with Rum', rupees: 170 },
      // Printed with no price at all.
      { name: 'Urrack', desc: 'seasonal', ask: true, note: 'Seasonal - ask for price' },
      { name: 'Cashew Fenni', desc: '60ml', rupees: 80 },
    ],
  },
  {
    name: 'Cocktails',
    group: 'bar',
    items: [
      { name: 'Mojito', desc: 'mint, lime, white rum, 7up', rupees: 300 },
      { name: 'Tequila Sunrise', desc: 'tequila, orange juice, triple sec', rupees: 350 },
      { name: 'Screwdriver', desc: 'vodka with orange juice', rupees: 300 },
      { name: 'Alex Special Gin', desc: 'Greater than Gin, lemon, cranberry juice', rupees: 300 },
      { name: 'Blue Lagoon', desc: 'blue curacao, lime, mint, 7up, vodka', rupees: 300 },
      { name: 'Pinacolada', desc: 'fresh pineapple juice, white rum, coconut', rupees: 300 },
    ],
  },
]
