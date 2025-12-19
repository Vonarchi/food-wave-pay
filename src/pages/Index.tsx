import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { QrCode, Smartphone, ChefHat, Zap, CreditCard, Clock, Settings, LayoutDashboard } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent opacity-95" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIyIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 px-6 py-20 md:py-32 text-center max-w-4xl mx-auto safe-top">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm px-4 py-2 rounded-full text-primary-foreground/90 text-sm mb-6">
              <Zap className="w-4 h-4" />
              Turn Every Phone Into an Ordering Terminal
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-6 leading-tight">
              TruckBite
            </h1>
            <p className="text-xl md:text-2xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              QR-powered mobile ordering for food trucks. Customers scan, order, and pay – orders go straight to your kitchen.
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
                className="border-2 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate('/kitchen')}
              >
                <ChefHat className="w-5 h-5 mr-2" />
                View Kitchen Display
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-2 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate('/admin')}
              >
                <Settings className="w-5 h-5 mr-2" />
                Menu Admin
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-2 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
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
          className="max-w-2xl mx-auto text-center bg-gradient-to-br from-primary to-accent rounded-3xl p-8 md:p-12"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-4">
            Ready to Streamline Your Orders?
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            Try the demo to see how TruckBite can transform your food truck operation
          </p>
          <Button
            size="xl"
            className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            onClick={() => navigate('/menu/demo')}
          >
            Launch Demo
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground text-sm">
          <p>TruckBite • Mobile-First Food Truck Ordering</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
