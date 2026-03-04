import { useState } from 'react';
import { ModifierGroup, ModifierOption } from '@/types';
import { Button } from '@/components/ui/button';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { motion } from 'framer-motion';

interface ModifierEditorProps {
  itemName: string;
  initialModifiers: ModifierGroup[];
  onSave: (modifiers: ModifierGroup[]) => void;
  onClose: () => void;
}

const generateId = () => crypto.randomUUID().slice(0, 8);

const emptyOption = (): ModifierOption => ({
  id: generateId(),
  name: '',
  price: 0,
});

const emptyGroup = (): ModifierGroup => ({
  id: generateId(),
  name: '',
  required: false,
  maxSelections: 1,
  options: [emptyOption()],
});

export const ModifierEditor = ({ itemName, initialModifiers, onSave, onClose }: ModifierEditorProps) => {
  const [groups, setGroups] = useState<ModifierGroup[]>(
    initialModifiers.length > 0 ? initialModifiers : []
  );

  const addGroup = () => setGroups((g) => [...g, emptyGroup()]);

  const removeGroup = (idx: number) =>
    setGroups((g) => g.filter((_, i) => i !== idx));

  const updateGroup = (idx: number, patch: Partial<ModifierGroup>) =>
    setGroups((g) => g.map((grp, i) => (i === idx ? { ...grp, ...patch } : grp)));

  const addOption = (groupIdx: number) =>
    setGroups((g) =>
      g.map((grp, i) =>
        i === groupIdx ? { ...grp, options: [...grp.options, emptyOption()] } : grp
      )
    );

  const removeOption = (groupIdx: number, optIdx: number) =>
    setGroups((g) =>
      g.map((grp, i) =>
        i === groupIdx
          ? { ...grp, options: grp.options.filter((_, j) => j !== optIdx) }
          : grp
      )
    );

  const updateOption = (groupIdx: number, optIdx: number, patch: Partial<ModifierOption>) =>
    setGroups((g) =>
      g.map((grp, i) =>
        i === groupIdx
          ? {
              ...grp,
              options: grp.options.map((opt, j) =>
                j === optIdx ? { ...opt, ...patch } : opt
              ),
            }
          : grp
      )
    );

  const handleSave = () => {
    // Filter out groups/options with empty names
    const cleaned = groups
      .filter((g) => g.name.trim())
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => o.name.trim()),
      }))
      .filter((g) => g.options.length > 0);
    onSave(cleaned);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-background w-full max-w-lg rounded-2xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-foreground">Edit Modifiers</h2>
            <p className="text-sm text-muted-foreground">{itemName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No modifier groups yet. Add one to let customers customize this item.
            </p>
          )}

          {groups.map((group, gi) => (
            <div key={group.id} className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={group.name}
                    onChange={(e) => updateGroup(gi, { name: e.target.value })}
                    placeholder="Group name (e.g. Size, Toppings)"
                    className="w-full p-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={(e) => updateGroup(gi, { required: e.target.checked })}
                        className="rounded"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <span className="text-muted-foreground">Selection:</span>
                      <select
                        value={group.maxSelections}
                        onChange={(e) => updateGroup(gi, { maxSelections: parseInt(e.target.value) })}
                        className="text-sm bg-secondary px-2 py-1 rounded border border-border"
                      >
                        <option value={1}>Single</option>
                        <option value={2}>Up to 2</option>
                        <option value={3}>Up to 3</option>
                        <option value={5}>Up to 5</option>
                        <option value={10}>Up to 10</option>
                      </select>
                    </label>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeGroup(gi)}
                  className="text-destructive hover:bg-destructive/10 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Options */}
              <div className="space-y-2 pl-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Options</p>
                {group.options.map((opt, oi) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.name}
                      onChange={(e) => updateOption(gi, oi, { name: e.target.value })}
                      placeholder="Option name"
                      className="flex-1 p-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">+$</span>
                      <input
                        type="number"
                        value={opt.price}
                        onChange={(e) => updateOption(gi, oi, { price: parseFloat(e.target.value) || 0 })}
                        step="0.25"
                        min="0"
                        className="w-16 p-2 rounded-lg border border-border bg-background text-foreground text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(gi, oi)}
                      className="text-muted-foreground hover:text-destructive shrink-0 h-8 w-8"
                      disabled={group.options.length <= 1}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addOption(gi)}
                  className="text-primary"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Option
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addGroup} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Modifier Group
          </Button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <Button variant="cart" size="lg" className="w-full" onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Modifiers
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
