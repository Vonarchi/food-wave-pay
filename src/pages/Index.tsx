import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { QrCode, Smartphone, ChefHat, Zap, Clock, Settings, Store, ArrowRight, Loader2 } from 'lucide-react';
import { SUPABASE_CONNECTIVITY_HINT, supabase } from '@/integrations/supabase/client';

interface TruckListing {
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  accent_color: string | null;
  location: string | null;
}

const Index = () => {
  const navigate = useNavigate();
  const [trucks, setTrucks] = useState<TruckListing[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(true);
  const [trucksError, setTrucksError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchTrucks = async () => {
      setTrucksLoading(true);
      setTrucksError(null);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), 10000)
      );

      try {
        const { data, error } = await Promise.race([
          supabase
            .from('food_trucks')
            .select('slug, name, description, logo_url, accent_color, location')
            .eq('is_active', true)
            .or('slug.eq.demo,is_published.eq.true')
            .order('name'),
          timeoutPromise,
        ]);

        if (!active) return;

        if (error && /is_published/i.test(error.message)) {
          const demo = await supabase
            .from('food_trucks')
            .select('slug, name, description, logo_url, accent_color, location')
            .eq('is_active', true)
            .eq('slug', 'demo');
          if (demo.error) throw demo.error;
          setTrucks((demo.data as TruckListing[]) || []);
          return;
        }
        if (error) {
          throw error;
        }

        setTrucks((data as TruckListing[]) || []);
      } catch (error) {
        if (!active) return;

        const message = error instanceof Error ? error.message : 'Failed to load restaurants';
        const isConnectivityIssue =
          message.includes('fetch') || message.includes('Failed') || message.includes('timed out');

        console.error('[index] Failed to load restaurants:', message);
        setTrucks([]);
        setTrucksError(isConnectivityIssue ? SUPABASE_CONNECTIVITY_HINT : message);
      } finally {
        if (active) setTrucksLoading(false);
      }
    };

    fetchTrucks();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="px-6 pt-10 pb-16 md:pt-16 safe-top">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-center mb-8">
            <img src="/logo.png?v=3" alt="KioKitchen" className="h-40 md:h-48 w-auto max-w-[min(100%,36rem)] object-contain mx-auto" width={1024} height={512} decoding="async" />
          </div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="text-center">
            <p className="kk-kicker mb-4">Restaurant ordering</p>
            <h1 className="kk-display mx-auto max-w-4xl">Turn your paper menu into a digital ordering system</h1>
            <p className="mt-5 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">Scan your menu. AI builds it. Customers order. You get paid.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="xl" onClick={() => navigate('/signup')}>Create my digital menu</Button>
              <Button size="xl" variant="outline" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>See how it works</Button>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm">
              <button type="button" className="underline text-muted-foreground" onClick={() => navigate('/menu/demo')}>Try KioKitchen</button>
              <button type="button" className="underline text-muted-foreground" onClick={() => navigate('/login')}>Restaurant login</button>
            </div>
          </motion.div>
          <ol className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {['Scan your menu', 'AI builds it', 'Customers order', 'You get paid'].map((step, index) => (
              <li key={step} className="kk-card px-3 py-4 text-center">
                <span className="kk-kicker">{index + 1}</span>
                <p className="mt-1 font-medium">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              ['QR ordering', '/menu/demo'],
              ['AI cashier', '/menu/demo'],
              ['Phone AI', '/signup'],
              ['Drive-thru', '/signup'],
            ].map(([label, href]) => (
              <button key={label} type="button" className="kk-card px-3 py-4 text-center font-medium" onClick={() => navigate(href)}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">How it works</h2>
            <p className="text-muted-foreground">Set up on your phone. Customers scan and order. No app download.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <QrCode className="w-10 h-10" />,
                title: 'Photograph your menu',
                description: 'No typing every item. A photo or PDF is enough to start.',
              },
              {
                icon: <Smartphone className="w-10 h-10" />,
                title: 'Review and publish',
                description: 'You edit names, prices, and options. Then you publish a mobile menu and QR code.',
              },
              {
                icon: <ChefHat className="w-10 h-10" />,
                title: 'Take orders',
                description: 'Customers scan, choose modifiers, and send the order to your kitchen display.',
              },
            ].map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-card rounded-2xl border border-border p-6 text-center hover:shadow-lg transition-shadow"
              >
                <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
                  {step.icon}
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Restaurant Directory */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">Order Online</h2>
            <p className="text-muted-foreground">Browse restaurants and order directly — no QR code needed</p>
          </motion.div>

          {trucksLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : trucksError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center">
              <p className="text-sm text-destructive">{trucksError}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          ) : trucks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No restaurants available yet. Try the demo menu above!</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trucks.map((truck, index) => (
                <motion.button
                  key={truck.slug}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigate(`/order/${truck.slug}`)}
                  className="bg-card rounded-2xl border border-border p-5 text-left hover:shadow-lg hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {truck.logo_url ? (
                      <img src={truck.logo_url} alt={truck.name} className="w-12 h-12 rounded-xl object-contain bg-muted p-1" />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-primary-foreground"
                        style={{ background: truck.accent_color || 'hsl(var(--primary))' }}
                      >
                        <Store className="w-6 h-6" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{truck.name}</h3>
                      {truck.location && (
                        <p className="text-xs text-muted-foreground truncate">{truck.location}</p>
                      )}
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                  {truck.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{truck.description}</p>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 bg-secondary/30">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">What you get</h2>
            <p className="text-muted-foreground">A digital menu you control, with ordering when you want it</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: <Clock className="w-6 h-6" />,
                title: 'No typing every menu item',
                description: 'Start from the menu you already printed.',
              },
              {
                icon: <Zap className="w-6 h-6" />,
                title: 'Digital menu in minutes',
                description: 'A photo or PDF becomes items, prices, and categories you can edit.',
              },
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: 'Customers use their own phones',
                description: 'They scan a QR code and order in the browser.',
              },
              {
                icon: <QrCode className="w-6 h-6" />,
                title: 'No special customer app',
                description: 'Nothing to download. The menu opens where they already are.',
              },
              {
                icon: <Settings className="w-6 h-6" />,
                title: 'Voice ordering available',
                description: 'The same menu can take a spoken order at the table, on the phone, or in a drive-thru test lane.',
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex gap-4 p-4"
              >
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground flex-shrink-0">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center bg-accent relative overflow-hidden rounded-3xl p-8 md:p-12"
        >
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
          <h2 className="relative text-2xl md:text-3xl font-bold text-accent-foreground mb-4">
            Ready to put your menu online?
          </h2>
          <p className="relative text-accent-foreground/70 mb-8">
            Create an account, photograph your menu, and publish a QR code.
          </p>
          <Button
            size="xl"
            className="relative bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate('/signup')}
          >
            Create My Digital Menu
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground text-sm">
          <p>KioKitchen • Digital menus and QR ordering for restaurants</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
