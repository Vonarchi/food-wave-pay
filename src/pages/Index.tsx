import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { QrCode, Smartphone, ChefHat, Zap, CreditCard, Clock, Settings, LayoutDashboard, Store, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

  useEffect(() => {
    const fetchTrucks = async () => {
      const { data } = await supabase
        .from('food_trucks')
        .select('slug, name, description, logo_url, accent_color, location')
        .eq('is_active', true)
        .order('name');
      setTrucks((data as TruckListing[]) || []);
      setTrucksLoading(false);
    };
    fetchTrucks();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-primary/85" />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-transparent to-transparent" />
        
        <div className="relative z-10 px-6 py-20 md:py-32 text-center max-w-4xl mx-auto safe-top">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-primary/20 backdrop-blur-sm px-4 py-2 rounded-full text-primary-foreground/90 text-sm mb-6 border border-primary/30">
              <Zap className="w-4 h-4" />
              Turn Every Phone Into an Ordering Terminal
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-6 leading-tight">
              Smackin Jacks
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              QR-powered mobile ordering for Smackin Jacks. Scan, order, and pay – orders go straight to the kitchen.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="xl"
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                onClick={() => navigate('/menu/demo')}
              >
                <QrCode className="w-5 h-5 mr-2" />
                Try Demo Menu
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-2 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate('/kitchen')}
              >
                <ChefHat className="w-5 h-5 mr-2" />
                View Kitchen Display
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-2 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate('/login')}
              >
                <Settings className="w-5 h-5 mr-2" />
                Restaurant Login
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-2 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate('/admin/dashboard')}
              >
                <LayoutDashboard className="w-5 h-5 mr-2" />
                System Overview
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-foreground mb-4">How It Works</h2>
            <p className="text-muted-foreground">Simple for customers, powerful for your business</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <QrCode className="w-10 h-10" />,
                title: 'Scan',
                description: 'Customer scans your unique QR code with their phone camera',
              },
              {
                icon: <Smartphone className="w-10 h-10" />,
                title: 'Order & Pay',
                description: 'Browse menu, customize items, and pay securely on their phone',
              },
              {
                icon: <ChefHat className="w-10 h-10" />,
                title: 'Prepare',
                description: 'Order appears instantly on your kitchen display system',
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
            <h2 className="text-3xl font-bold text-foreground mb-4">Built for the Lunch Rush</h2>
            <p className="text-muted-foreground">Everything you need, nothing you don't</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: <Clock className="w-6 h-6" />,
                title: 'No Download Required',
                description: 'PWA loads instantly in the browser. No app store wait times.',
              },
              {
                icon: <CreditCard className="w-6 h-6" />,
                title: 'Secure Payments',
                description: 'Apple Pay, Google Pay, and cards. PCI-compliant processing.',
              },
              {
                icon: <Zap className="w-6 h-6" />,
                title: 'Real-Time Updates',
                description: 'Orders appear on your KDS the moment payment completes.',
              },
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: 'No Account Needed',
                description: 'Customers order without creating an account. Zero friction.',
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
            Ready to Streamline Your Orders?
          </h2>
          <p className="relative text-accent-foreground/70 mb-8">
            Try the demo to see how Smackin Jacks can transform your food truck operation
          </p>
          <Button
            size="xl"
            className="relative bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate('/menu/demo')}
          >
            Launch Demo
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground text-sm">
          <p>Smackin Jacks • Mobile-First Food Truck Ordering</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
