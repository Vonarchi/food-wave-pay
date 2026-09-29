import type { CartItem, MenuItem, SelectedModifier } from "@/types";
import type { CartLine, PricedLine } from "@/lib/ordering/engine";

export function cartItemsToLines(items: CartItem[]): CartLine[] {
  return items.slice(0, 30).map((item) => ({
    lineId: item.id,
    itemId: item.menuItem.id,
    quantity: item.quantity,
    note: item.specialInstructions,
    selections: item.selectedModifiers.map((group) => ({
      groupId: group.groupId,
      optionIds: group.options.map((option) => option.id),
    })),
  }));
}

export function pricedLinesToCartItems(lines: PricedLine[]): CartItem[] {
  return lines.map((line) => {
    const groups = new Map<string, SelectedModifier>();
    for (const mod of line.modifiers) {
      const existing = groups.get(mod.groupId);
      const option = { id: mod.optionId, name: mod.optionName, price: mod.price };
      if (existing) existing.options.push(option);
      else {
        groups.set(mod.groupId, {
          groupId: mod.groupId,
          groupName: mod.groupName,
          options: [option],
        });
      }
    }
    const menuItem: MenuItem = {
      id: line.itemId,
      name: line.name,
      description: line.description,
      price: line.basePrice,
      category: line.category,
      available: true,
    };
    return {
      id: line.lineId,
      menuItem,
      quantity: line.quantity,
      selectedModifiers: [...groups.values()],
      specialInstructions: line.note,
    };
  });
}
