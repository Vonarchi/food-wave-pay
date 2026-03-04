import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, ArrowLeft, Trash2, Check, Loader2, ImageIcon, Plus, Edit2, Image as ImageIconLucide, QrCode, Download, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { ModifierEditor } from '@/components/admin/ModifierEditor';
import { ModifierGroup } from '@/types';

interface ExtractedItem {
  name: string;
  description?: string;
  price: number;
  category: string;
  selected?: boolean;
}

const AdminPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [truckId, setTruckId] = useState('demo');
  const [isSaving, setIsSaving] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to storage
    await uploadAndProcess(file);
  };

  const uploadAndProcess = async (file: File) => {
    setIsProcessing(true);
    setExtractedItems([]);

    try {
      // Upload image to Supabase storage
      const fileName = `menu-${Date.now()}.${file.name.split('.').pop()}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;
      console.log('Image uploaded:', imageUrl);

      // Call edge function to extract menu items
      const { data, error } = await supabase.functions.invoke('extract-menu', {
        body: { imageUrl },
      });

      if (error) {
        throw new Error(`Extraction failed: ${error.message}`);
      }

      if (data.items && data.items.length > 0) {
        // Mark all items as selected by default
        const itemsWithSelection = data.items.map((item: ExtractedItem) => ({
          ...item,
          selected: true,
        }));
        setExtractedItems(itemsWithSelection);
        toast.success(`Found ${data.items.length} menu items!`);
      } else {
        toast.error('No menu items could be extracted. Try a clearer image.');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process menu');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleItemSelection = (index: number) => {
    setExtractedItems((items) =>
      items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    setExtractedItems((items) =>
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (index: number) => {
    setExtractedItems((items) => items.filter((_, i) => i !== index));
  };

  const addManualItem = () => {
    setExtractedItems((items) => [
      ...items,
      { name: '', description: '', price: 0, category: 'Main', selected: true },
    ]);
  };

  const saveSelectedItems = async () => {
    const selectedItems = extractedItems.filter((item) => item.selected && item.name);

    if (selectedItems.length === 0) {
      toast.error('No items selected to save');
      return;
    }

    setIsSaving(true);

    try {
      const itemsToInsert = selectedItems.map((item) => ({
        truck_id: truckId,
        name: item.name,
        description: item.description || null,
        price: item.price,
        category: item.category,
        is_available: true,
        modifiers: [],
      }));

      const { error } = await supabase.from('menu_items').insert(itemsToInsert);

      if (error) {
        throw error;
      }

      toast.success(`Saved ${selectedItems.length} menu items!`);
      setExtractedItems([]);
      setImagePreview(null);
    } catch (error) {
      console.error('Error saving items:', error);
      toast.error('Failed to save menu items');
    } finally {
      setIsSaving(false);
    }
  };

  const categories = [...new Set(extractedItems.map((item) => item.category))];

  // --- Existing menu items management ---
  interface DbMenuItem {
    id: string;
    name: string;
    price: number;
    category: string;
    image_url: string | null;
    modifiers: unknown;
  }
  const [existingItems, setExistingItems] = useState<DbMenuItem[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [editingModifiersItem, setEditingModifiersItem] = useState<DbMenuItem | null>(null);
  const itemImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchExisting = async () => {
      setLoadingExisting(true);
      const { data } = await supabase
        .from('menu_items')
        .select('id, name, price, category, image_url, modifiers')
        .eq('truck_id', truckId)
        .order('category')
        .order('name');
      setExistingItems((data as DbMenuItem[]) || []);
      setLoadingExisting(false);
    };
    fetchExisting();
  }, [truckId, isSaving]); // re-fetch after saving new items

  const handleItemImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingItemId) return;

    try {
      const fileName = `item-${uploadingItemId}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('menu_items')
        .update({ image_url: urlData.publicUrl })
        .eq('id', uploadingItemId);

      if (updateError) throw updateError;

      setExistingItems((items) =>
        items.map((item) =>
          item.id === uploadingItemId ? { ...item, image_url: urlData.publicUrl } : item
        )
      );
      toast.success('Image uploaded!');
    } catch (err) {
      console.error('Image upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploadingItemId(null);
      if (itemImageInputRef.current) itemImageInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-foreground text-background p-4 z-30">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="text-background hover:bg-background/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Menu Admin</h1>
            <p className="text-background/70 text-sm">Capture menu from image</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Truck ID Selection */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <label className="block text-sm font-medium text-foreground mb-2">
            Food Truck ID
          </label>
          <input
            type="text"
            value={truckId}
            onChange={(e) => setTruckId(e.target.value)}
            placeholder="Enter truck ID"
            className="w-full p-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </motion.section>

        {/* Image Capture Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <h2 className="font-semibold text-foreground mb-4">Capture Menu Image</h2>

          {!imagePreview ? (
            <div className="grid grid-cols-2 gap-4">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              <Button
                variant="outline"
                size="lg"
                className="h-32 flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="w-8 h-8 text-primary" />
                <span>Take Photo</span>
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="h-32 flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-primary" />
                <span>Upload Image</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img
                  src={imagePreview}
                  alt="Menu preview"
                  className="w-full max-h-64 object-contain bg-secondary/20"
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Extracting menu items...</p>
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setImagePreview(null);
                  setExtractedItems([]);
                }}
                disabled={isProcessing}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Choose Different Image
              </Button>
            </div>
          )}
        </motion.section>

        {/* Extracted Items */}
        <AnimatePresence>
          {extractedItems.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-card rounded-2xl border border-border p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">
                  Extracted Items ({extractedItems.filter((i) => i.selected).length} selected)
                </h2>
                <Button variant="outline" size="sm" onClick={addManualItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {categories.map((category) => (
                  <div key={category}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      {category}
                    </h3>
                    {extractedItems
                      .map((item, index) => ({ item, index }))
                      .filter(({ item }) => item.category === category)
                      .map(({ item, index }) => (
                        <motion.div
                          key={index}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`p-3 rounded-lg border mb-2 transition-colors ${
                            item.selected
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-border bg-secondary/20'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleItemSelection(index)}
                              className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                item.selected
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground'
                              }`}
                            >
                              {item.selected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </button>

                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                                placeholder="Item name"
                                className="w-full bg-transparent font-medium text-foreground focus:outline-none"
                              />
                              <input
                                type="text"
                                value={item.description || ''}
                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                placeholder="Description (optional)"
                                className="w-full bg-transparent text-sm text-muted-foreground focus:outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">$</span>
                                <input
                                  type="number"
                                  value={item.price}
                                  onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
                                  step="0.01"
                                  min="0"
                                  className="w-20 bg-transparent text-sm font-medium text-foreground focus:outline-none"
                                />
                                <select
                                  value={item.category}
                                  onChange={(e) => updateItem(index, 'category', e.target.value)}
                                  className="ml-auto text-xs bg-secondary px-2 py-1 rounded border border-border"
                                >
                                  <option value="Appetizers">Appetizers</option>
                                  <option value="Mains">Mains</option>
                                  <option value="Sides">Sides</option>
                                  <option value="Drinks">Drinks</option>
                                  <option value="Desserts">Desserts</option>
                                  <option value="Specials">Specials</option>
                                </select>
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(index)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <Button
                  variant="cart"
                  size="lg"
                  className="w-full"
                  onClick={saveSelectedItems}
                  disabled={isSaving || extractedItems.filter((i) => i.selected).length === 0}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      Save {extractedItems.filter((i) => i.selected).length} Items to Menu
                    </>
                  )}
                </Button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Existing Menu Items - Image Management */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border p-4"
        >
          <h2 className="font-semibold text-foreground mb-4">
            Existing Menu Items ({existingItems.length})
          </h2>

          <input
            ref={itemImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleItemImageUpload}
            className="hidden"
          />

          {loadingExisting ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : existingItems.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No menu items yet. Use the image capture above or add items manually.
            </p>
          ) : (
            <div className="space-y-2">
              {existingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  {item.image_url ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-border">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <ImageIconLucide className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.category} • ${item.price.toFixed(2)}
                      {Array.isArray(item.modifiers) && (item.modifiers as any[]).length > 0 && (
                        <span className="text-primary ml-1">• {(item.modifiers as any[]).length} modifier{(item.modifiers as any[]).length > 1 ? 's' : ''}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingModifiersItem(item)}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      Modifiers
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadingItemId(item.id);
                        itemImageInputRef.current?.click();
                      }}
                    >
                      <Upload className="w-3 h-3 mr-1" />
                      {item.image_url ? 'Change' : 'Add'} Photo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* QR Code Generator */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">QR Code for Menu</h2>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Print this QR code and place it at your truck. Customers scan it to open your menu instantly.
          </p>

          <div className="flex flex-col items-center gap-6">
            <div id="qr-code-container" className="bg-background p-6 rounded-2xl border border-border shadow-sm">
              <QRCodeSVG
                value={`${window.location.origin}/menu/${truckId}`}
                size={200}
                level="H"
                includeMargin
                className="mx-auto"
              />
              <p className="text-center text-xs text-muted-foreground mt-3 font-medium">
                {truckId}
              </p>
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground break-all">
                {window.location.origin}/menu/{truckId}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const svg = document.querySelector('#qr-code-container svg');
                  if (!svg) return;
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');
                  const img = new Image();
                  img.onload = () => {
                    canvas.width = img.width * 2;
                    canvas.height = img.height * 2;
                    ctx!.fillStyle = '#ffffff';
                    ctx!.fillRect(0, 0, canvas.width, canvas.height);
                    ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const a = document.createElement('a');
                    a.download = `qr-${truckId}.png`;
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                  };
                  img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download QR Code
              </Button>
            </div>
          </div>
        </motion.section>
      </div>

      {/* Modifier Editor Modal */}
      <AnimatePresence>
        {editingModifiersItem && (
          <ModifierEditor
            itemName={editingModifiersItem.name}
            initialModifiers={
              Array.isArray(editingModifiersItem.modifiers)
                ? (editingModifiersItem.modifiers as ModifierGroup[])
                : []
            }
            onClose={() => setEditingModifiersItem(null)}
            onSave={async (modifiers) => {
              try {
                const { error } = await supabase
                  .from('menu_items')
                  .update({ modifiers: modifiers as any })
                  .eq('id', editingModifiersItem.id);
                if (error) throw error;
                setExistingItems((items) =>
                  items.map((item) =>
                    item.id === editingModifiersItem.id
                      ? { ...item, modifiers }
                      : item
                  )
                );
                toast.success('Modifiers saved!');
                setEditingModifiersItem(null);
              } catch (err) {
                console.error(err);
                toast.error('Failed to save modifiers');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPage;
