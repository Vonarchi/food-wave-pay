import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, ChevronRight, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const STEPS = [
  { id: 'profile', title: 'Restaurant Profile', fields: ['restaurant_name', 'owner_name', 'email', 'phone'] },
  { id: 'category', title: 'First Category', fields: ['category'] },
  { id: 'items', title: 'First Menu Items', fields: ['items'] },
  { id: 'qr', title: 'QR Code', fields: [] },
  { id: 'subscription', title: 'Subscription', fields: [] },
  { id: 'done', title: 'Dashboard', fields: [] },
];

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [restaurantName, setRestaurantName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Slug derived from restaurant name
  const slug = restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'my-restaurant';

  useEffect(() => {
    if (profile) {
      setOwnerName(profile.full_name || '');
      setRestaurantName(profile.restaurant_name || '');
    }
    if (user?.email) {
      // Email comes from auth
    }
  }, [profile, user]);

  const updateProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: ownerName,
        restaurant_name: restaurantName,
        phone: phone || null,
      });
      toast.success('Saved');
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const ensureFoodTruck = async () => {
    const { data: existing } = await supabase
      .from('food_trucks')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!existing) {
      await supabase.from('food_trucks').insert({
        slug,
        name: restaurantName || slug,
        owner_id: user?.id,
      });
    } else {
      await supabase
        .from('food_trucks')
        .update({ owner_id: user?.id, name: restaurantName || slug })
        .eq('slug', slug);
    }
  };

  const handleNext = async () => {
    const step = STEPS[stepIndex];
    if (step.id === 'profile') {
      await updateProfile();
      await ensureFoodTruck();
    }
    if (stepIndex >= STEPS.length - 1) {
      navigate('/admin');
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const handleSkip = () => {
    if (stepIndex >= STEPS.length - 1) {
      navigate('/admin');
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const currentStep = STEPS[stepIndex];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-6">
        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full ${
                i <= stepIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {currentStep.id === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-foreground">Restaurant Profile</h1>
                <p className="text-muted-foreground mt-1">Tell us about your restaurant</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Restaurant Name</label>
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="e.g. Smackin Jacks"
                    className="w-full p-3 rounded-lg border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Your Name</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Owner name"
                    className="w-full p-3 rounded-lg border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Phone (optional)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full p-3 rounded-lg border border-border bg-background"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Email: {user?.email}
                </p>
              </div>
            </motion.div>
          )}

          {currentStep.id === 'category' && (
            <motion.div
              key="category"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold">Add First Category</h1>
                <p className="text-muted-foreground mt-1">e.g. Mains, Sides, Drinks</p>
              </div>
              <div className="bg-card rounded-2xl border p-6">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category name"
                  className="w-full p-3 rounded-lg border border-border bg-background"
                />
                {category && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={async () => {
                      setSaving(true);
                      await supabase.from('menu_items').insert({
                        truck_id: slug,
                        name: 'Sample Item',
                        price: 0,
                        category: category,
                        description: 'Edit in Menu Admin',
                      });
                      setSaving(false);
                      toast.success('Category created with sample item');
                    }}
                    disabled={saving}
                  >
                    Add sample item in this category
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {currentStep.id === 'items' && (
            <motion.div
              key="items"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div>
                <h1 className="text-2xl font-bold">Add Menu Items</h1>
                <p className="text-muted-foreground mt-1">Use Menu Admin to add items from a photo or manually</p>
              </div>
              <Button
                variant="cart"
                size="lg"
                className="w-full mt-6"
                onClick={() => navigate('/admin')}
              >
                Open Menu Admin
              </Button>
            </motion.div>
          )}

          {currentStep.id === 'qr' && (
            <motion.div
              key="qr"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div>
                <h1 className="text-2xl font-bold">Your QR Code</h1>
                <p className="text-muted-foreground mt-1">Customers scan this to view your menu</p>
              </div>
              <div className="bg-card rounded-2xl border p-6 mt-6 text-center">
                <p className="text-sm text-muted-foreground break-all mb-4">
                  {typeof window !== 'undefined' && `${window.location.origin}/menu/${slug}`}
                </p>
                <Button variant="outline" onClick={() => navigate('/admin')}>
                  View &amp; Download QR in Menu Admin
                </Button>
              </div>
            </motion.div>
          )}

          {currentStep.id === 'subscription' && (
            <motion.div
              key="subscription"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div>
                <h1 className="text-2xl font-bold">Subscription</h1>
                <p className="text-muted-foreground mt-1">
                  TODO: Stripe subscription setup. For launch, you can use the app. Manage billing in Settings.
                </p>
              </div>
              <div className="mt-6 p-4 rounded-xl bg-muted/50 text-sm text-muted-foreground">
                Billing settings coming soon. Proceed to dashboard.
              </div>
            </motion.div>
          )}

          {currentStep.id === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center">
                <div className="w-20 h-20 bg-success rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-success-foreground" />
                </div>
                <h1 className="text-2xl font-bold">You're all set!</h1>
                <p className="text-muted-foreground mt-2">Go to your dashboard to manage menus and orders</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-3 mt-8">
          <Button variant="outline" onClick={handleSkip} className="flex-1">
            {stepIndex >= STEPS.length - 1 ? 'Skip' : 'Skip step'}
          </Button>
          <Button variant="cart" onClick={handleNext} className="flex-1" disabled={saving}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {stepIndex >= STEPS.length - 1 ? 'Go to Dashboard' : 'Next'}
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
