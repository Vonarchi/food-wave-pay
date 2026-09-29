import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { readCampaign } from '@/lib/commerce';

/** Flyer and campaign links land here, then continue to signup with the campaign kept. */
export default function StartPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const campaign = readCampaign(window.location.search);
    if (campaign) sessionStorage.setItem('kk-campaign', campaign);
    navigate(campaign ? `/signup?campaign=${encodeURIComponent(campaign)}` : '/signup', { replace: true });
  }, [navigate]);

  return <p className="p-8 text-sm text-muted-foreground">Opening KioKitchen…</p>;
}
