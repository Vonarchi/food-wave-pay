import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { readCampaign } from '@/lib/commerce';

/** Flyer and campaign QR links land here, then open scan-first (camera before signup). */
export default function StartPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const campaign = readCampaign(window.location.search);
    if (campaign) sessionStorage.setItem('kk-campaign', campaign);
    navigate(campaign ? `/scan?campaign=${encodeURIComponent(campaign)}` : '/scan', { replace: true });
  }, [navigate]);

  return <p className="p-8 text-sm text-muted-foreground">Opening camera…</p>;
}
