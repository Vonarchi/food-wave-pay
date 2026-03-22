import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, Palette, Save, Loader2, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface BrandingSettingsProps {
  truckId: string;
  currentLogoUrl?: string;
  currentAccentColor?: string;
  onUpdate: (updates: { logo_url?: string; accent_color?: string }) => void;
}

const PRESET_COLORS = [
  { name: 'Red Orange', value: '#F3310A' },
  { name: 'Crimson', value: '#DC2626' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Sky Blue', value: '#0EA5E9' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Slate', value: '#475569' },
];

export const BrandingSettings = ({ truckId, currentLogoUrl, currentAccentColor, onUpdate }: BrandingSettingsProps) => {
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl || '');
  const [accentColor, setAccentColor] = useState(currentAccentColor || '#F3310A');

  useEffect(() => {
    if (currentLogoUrl !== undefined) setLogoUrl(currentLogoUrl || '');
    if (currentAccentColor) setAccentColor(currentAccentColor);
  }, [currentLogoUrl, currentAccentColor]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileName = `logo-${truckId}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(fileName);

      setLogoUrl(urlData.publicUrl);
      toast.success('Logo uploaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert the food truck record
      const { data: existing } = await supabase
        .from('food_trucks' as any)
        .select('id')
        .eq('slug', truckId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('food_trucks' as any)
          .update({
            logo_url: logoUrl || null,
            accent_color: accentColor,
          } as any)
          .eq('slug', truckId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('food_trucks' as any)
          .insert({
            slug: truckId,
            name: truckId,
            logo_url: logoUrl || null,
            accent_color: accentColor,
          } as any);
        if (error) throw error;
      }

      onUpdate({ logo_url: logoUrl || undefined, accent_color: accentColor });
      toast.success('Branding saved!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-card rounded-2xl border border-border p-6 space-y-6"
    >
      <div className="flex items-center gap-2">
        <Palette className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-foreground">Branding</h2>
      </div>

      {/* Logo Upload */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">Logo</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />

        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="relative w-20 h-20 rounded-xl border border-border overflow-hidden bg-secondary/20">
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              <button
                onClick={() => setLogoUrl('')}
                className="absolute top-1 right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-secondary/10">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            {logoUrl ? 'Change' : 'Upload'} Logo
          </Button>
        </div>
      </div>

      {/* Accent Color */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">Accent Color</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setAccentColor(c.value)}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                accentColor === c.value ? 'border-foreground scale-110 ring-2 ring-foreground/20' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
          <label className="w-9 h-9 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer overflow-hidden relative" title="Custom color">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md" style={{ backgroundColor: accentColor }} />
          <span className="text-sm text-muted-foreground font-mono">{accentColor}</span>
        </div>

        {/* Preview */}
        <div className="rounded-xl p-4 text-white text-sm font-medium text-center" style={{ backgroundColor: accentColor }}>
          Menu Header Preview
        </div>
      </div>

      {/* Save */}
      <Button variant="cart" size="lg" className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Branding
      </Button>
    </motion.section>
  );
};
