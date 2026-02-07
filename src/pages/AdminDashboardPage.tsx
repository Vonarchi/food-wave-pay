import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  QrCode, 
  Smartphone, 
  CreditCard, 
  Database, 
  ChefHat, 
  Camera, 
  ArrowRight,
  Users,
  ShoppingCart,
  Bell,
  Settings,
  ImageIcon
} from 'lucide-react';

const AdminDashboardPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-foreground text-background p-4 z-30">
        <div className="flex items-center gap-4 max-w-6xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="text-background hover:bg-background/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">System Overview</h1>
            <p className="text-background/70 text-sm">Smackin Jacks Architecture</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 space-y-8">
        {/* Quick Links */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { label: 'Demo Menu', icon: Smartphone, path: '/menu/demo', color: 'bg-primary' },
            { label: 'Kitchen Display', icon: ChefHat, path: '/kitchen', color: 'bg-warning' },
            { label: 'Menu Admin', icon: Camera, path: '/admin', color: 'bg-success' },
            { label: 'Home', icon: QrCode, path: '/', color: 'bg-accent' },
          ].map((item) => (
            <Button
              key={item.label}
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => navigate(item.path)}
            >
              <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center text-primary-foreground`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-sm">{item.label}</span>
            </Button>
          ))}
        </motion.section>

        {/* System Diagram */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl border border-border p-6 overflow-x-auto"
        >
          <h2 className="font-bold text-foreground mb-6 text-lg">System Flow Diagram</h2>
          
          <div className="min-w-[800px] relative">
            {/* Customer Flow */}
            <div className="mb-12">
              <div className="text-sm font-medium text-primary mb-4 uppercase tracking-wide">Customer Journey</div>
              <div className="flex items-center gap-4">
                <FlowNode 
                  icon={<QrCode className="w-6 h-6" />}
                  label="QR Code"
                  sublabel="Scan with phone"
                  color="bg-primary"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<Smartphone className="w-6 h-6" />}
                  label="Menu (PWA)"
                  sublabel="/menu/:truckId"
                  color="bg-primary"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<ShoppingCart className="w-6 h-6" />}
                  label="Cart & Checkout"
                  sublabel="/checkout/:truckId"
                  color="bg-primary"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<CreditCard className="w-6 h-6" />}
                  label="Payment"
                  sublabel="Stripe (TODO)"
                  color="bg-muted"
                  muted
                />
                <FlowArrow />
                <FlowNode 
                  icon={<Bell className="w-6 h-6" />}
                  label="Confirmation"
                  sublabel="/confirmation/:id"
                  color="bg-success"
                />
              </div>
            </div>

            {/* Data Flow */}
            <div className="mb-12">
              <div className="text-sm font-medium text-accent mb-4 uppercase tracking-wide">Data Layer</div>
              <div className="flex items-center gap-4">
                <FlowNode 
                  icon={<Database className="w-6 h-6" />}
                  label="Lovable Cloud"
                  sublabel="PostgreSQL + Realtime"
                  color="bg-accent"
                />
                <div className="flex-1 border-t-2 border-dashed border-accent/30 relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-card px-2 text-xs text-muted-foreground">
                    Real-time sync
                  </div>
                </div>
                <div className="flex gap-4">
                  <FlowNode 
                    icon={<span className="text-xs font-bold">orders</span>}
                    label="Orders Table"
                    sublabel="Stores all orders"
                    color="bg-accent/80"
                    small
                  />
                  <FlowNode 
                    icon={<span className="text-xs font-bold">menu</span>}
                    label="Menu Items"
                    sublabel="Product catalog"
                    color="bg-accent/80"
                    small
                  />
                </div>
              </div>
            </div>

            {/* Kitchen Flow */}
            <div className="mb-12">
              <div className="text-sm font-medium text-warning mb-4 uppercase tracking-wide">Kitchen Operations</div>
              <div className="flex items-center gap-4">
                <FlowNode 
                  icon={<Bell className="w-6 h-6" />}
                  label="New Order Alert"
                  sublabel="Real-time push"
                  color="bg-warning"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<ChefHat className="w-6 h-6" />}
                  label="Kitchen Display"
                  sublabel="/kitchen"
                  color="bg-warning"
                />
                <FlowArrow />
                <div className="flex gap-2">
                  <StatusBadge label="Received" color="bg-primary" />
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <StatusBadge label="In Progress" color="bg-warning" />
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <StatusBadge label="Ready" color="bg-success" />
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <StatusBadge label="Complete" color="bg-muted" />
                </div>
              </div>
            </div>

            {/* Admin Flow */}
            <div>
              <div className="text-sm font-medium text-success mb-4 uppercase tracking-wide">Admin Tools</div>
              <div className="flex items-center gap-4">
                <FlowNode 
                  icon={<Camera className="w-6 h-6" />}
                  label="Capture Menu"
                  sublabel="/admin"
                  color="bg-success"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<ImageIcon className="w-6 h-6" />}
                  label="AI Extraction"
                  sublabel="Gemini Vision"
                  color="bg-success"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<Settings className="w-6 h-6" />}
                  label="Review & Edit"
                  sublabel="Verify items"
                  color="bg-success"
                />
                <FlowArrow />
                <FlowNode 
                  icon={<Database className="w-6 h-6" />}
                  label="Save to DB"
                  sublabel="menu_items table"
                  color="bg-accent"
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* Component Legend */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid md:grid-cols-2 gap-6"
        >
          {/* Pages */}
          <div className="bg-card rounded-2xl border border-border p-6">
            <h3 className="font-bold text-foreground mb-4">Pages & Routes</h3>
            <div className="space-y-3">
              {[
                { path: '/', name: 'Home / Landing', desc: 'Marketing page with demo links' },
                { path: '/menu/:truckId', name: 'Menu Page', desc: 'Customer-facing menu browser' },
                { path: '/checkout/:truckId', name: 'Checkout Page', desc: 'Cart review & payment' },
                { path: '/confirmation/:orderId', name: 'Confirmation', desc: 'Order success & tracking' },
                { path: '/kitchen', name: 'Kitchen Display', desc: 'Real-time order queue (KDS)' },
                { path: '/admin', name: 'Menu Admin', desc: 'AI-powered menu capture' },
                { path: '/admin/dashboard', name: 'System Overview', desc: 'This page - architecture view' },
              ].map((page) => (
                <div key={page.path} className="flex items-start gap-3">
                  <code className="text-xs bg-secondary px-2 py-1 rounded text-primary font-mono shrink-0">
                    {page.path}
                  </code>
                  <div>
                    <p className="text-sm font-medium text-foreground">{page.name}</p>
                    <p className="text-xs text-muted-foreground">{page.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tech Stack */}
          <div className="bg-card rounded-2xl border border-border p-6">
            <h3 className="font-bold text-foreground mb-4">Technology Stack</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Frontend</p>
                <div className="flex flex-wrap gap-2">
                  {['React', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'Zustand', 'React Router'].map((tech) => (
                    <span key={tech} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Backend (Lovable Cloud)</p>
                <div className="flex flex-wrap gap-2">
                  {['PostgreSQL', 'Real-time Subscriptions', 'Edge Functions', 'Storage Buckets'].map((tech) => (
                    <span key={tech} className="text-xs bg-accent/10 text-accent px-2 py-1 rounded">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">AI Integration</p>
                <div className="flex flex-wrap gap-2">
                  {['Lovable AI Gateway', 'Gemini 2.5 Flash', 'Vision/OCR'].map((tech) => (
                    <span key={tech} className="text-xs bg-success/10 text-success px-2 py-1 rounded">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">PWA Features</p>
                <div className="flex flex-wrap gap-2">
                  {['Installable', 'Offline-Ready', 'Mobile-First', 'No App Store'].map((tech) => (
                    <span key={tech} className="text-xs bg-warning/10 text-warning px-2 py-1 rounded">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Database Schema */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl border border-border p-6"
        >
          <h3 className="font-bold text-foreground mb-4">Database Schema</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-secondary/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-accent" />
                <span className="font-mono text-sm font-bold text-foreground">orders</span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                {[
                  { name: 'id', type: 'UUID', key: true },
                  { name: 'order_number', type: 'TEXT' },
                  { name: 'truck_id', type: 'TEXT' },
                  { name: 'customer_name', type: 'TEXT?' },
                  { name: 'items', type: 'JSONB' },
                  { name: 'subtotal', type: 'NUMERIC' },
                  { name: 'tax', type: 'NUMERIC' },
                  { name: 'total', type: 'NUMERIC' },
                  { name: 'status', type: 'TEXT' },
                  { name: 'created_at', type: 'TIMESTAMPTZ' },
                ].map((col) => (
                  <div key={col.name} className="flex justify-between">
                    <span className={col.key ? 'text-primary' : 'text-foreground'}>{col.name}</span>
                    <span className="text-muted-foreground">{col.type}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-accent" />
                <span className="font-mono text-sm font-bold text-foreground">menu_items</span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                {[
                  { name: 'id', type: 'UUID', key: true },
                  { name: 'truck_id', type: 'TEXT' },
                  { name: 'name', type: 'TEXT' },
                  { name: 'description', type: 'TEXT?' },
                  { name: 'price', type: 'NUMERIC' },
                  { name: 'category', type: 'TEXT' },
                  { name: 'image_url', type: 'TEXT?' },
                  { name: 'is_available', type: 'BOOLEAN' },
                  { name: 'modifiers', type: 'JSONB' },
                  { name: 'created_at', type: 'TIMESTAMPTZ' },
                ].map((col) => (
                  <div key={col.name} className="flex justify-between">
                    <span className={col.key ? 'text-primary' : 'text-foreground'}>{col.name}</span>
                    <span className="text-muted-foreground">{col.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

// Helper Components
const FlowNode = ({ 
  icon, 
  label, 
  sublabel, 
  color, 
  small = false,
  muted = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  sublabel: string; 
  color: string;
  small?: boolean;
  muted?: boolean;
}) => (
  <div className={`flex flex-col items-center ${small ? 'min-w-[80px]' : 'min-w-[100px]'}`}>
    <div className={`${small ? 'w-12 h-12' : 'w-14 h-14'} ${color} rounded-xl flex items-center justify-center text-primary-foreground ${muted ? 'opacity-50' : ''}`}>
      {icon}
    </div>
    <p className={`${small ? 'text-xs' : 'text-sm'} font-medium text-foreground mt-2 text-center ${muted ? 'opacity-50' : ''}`}>
      {label}
    </p>
    <p className="text-xs text-muted-foreground text-center">{sublabel}</p>
  </div>
);

const FlowArrow = () => (
  <div className="flex-1 flex items-center justify-center min-w-[30px]">
    <div className="w-full h-0.5 bg-border relative">
      <ArrowRight className="w-4 h-4 text-muted-foreground absolute -right-1 -top-2" />
    </div>
  </div>
);

const StatusBadge = ({ label, color }: { label: string; color: string }) => (
  <span className={`${color} text-primary-foreground text-xs px-2 py-1 rounded-full font-medium`}>
    {label}
  </span>
);

export default AdminDashboardPage;
