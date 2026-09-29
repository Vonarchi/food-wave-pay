import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { can, type StaffRole } from '@/lib/commerce';
import { supabase } from '@/integrations/supabase/client';

type Row = { id: string; user_id: string; role: StaffRole };

export default function StaffPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slug, setSlug] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<StaffRole>('kitchen');

  const load = async (restaurant: string) => {
    const { data, error } = await supabase.from('restaurant_staff').select('id, user_id, role').eq('restaurant_slug', restaurant);
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    if (!user) return;
    void supabase.from('food_trucks').select('slug').eq('owner_id', user.id).limit(1).maybeSingle().then(({ data }) => {
      if (!data) return;
      setSlug(data.slug);
      void load(data.slug);
    });
  }, [user]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!can('owner', 'manage_staff')) return;
    const { error } = await supabase.from('restaurant_staff').insert({ user_id: userId.trim(), restaurant_slug: slug, role });
    if (error) toast.error(error.message);
    else {
      setUserId('');
      toast.success('Staff member added');
      void load(slug);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Back to dashboard" onClick={() => navigate('/admin/dashboard')}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <p className="kk-kicker">Staff</p>
            <h1 className="text-xl font-semibold">{slug || 'Team'}</h1>
          </div>
        </div>
      </header>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">Owners manage the restaurant. Managers edit the menu and see analytics. Kitchen updates tickets. Staff can see orders.</p>
        {rows.map((row) => (
          <div key={row.id} className="kk-card p-3 flex justify-between text-sm">
            <span className="truncate">{row.user_id}</span>
            <span className="capitalize">{row.role}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No extra staff yet. You still have owner access.</p>}
        <form onSubmit={(event) => void add(event)} className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="staff-user">Staff user id</label>
          <input id="staff-user" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)} />
          <label className="block text-sm font-medium" htmlFor="staff-role">Role</label>
          <select id="staff-role" className="w-full rounded-xl border border-input bg-background px-3 py-2" value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>
            <option value="manager">Manager</option>
            <option value="kitchen">Kitchen</option>
            <option value="staff">Staff</option>
          </select>
          <Button type="submit" disabled={!slug || !userId.trim()}>Add staff</Button>
        </form>
      </div>
    </div>
  );
}
