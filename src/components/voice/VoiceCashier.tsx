import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore, useOrderStore } from "@/store/useStore";
import { track } from "@/lib/analytics";
import { friendlySupabaseError } from "@/lib/restaurant";
import { cartItemsToLines, pricedLinesToCartItems } from "@/lib/ordering/cartSync";
import { claimOnce } from "@/lib/ordering/submitGuard";
import { createBrowserSpeechToText, createBrowserTextToSpeech } from "@/lib/speech/browserSpeech";
import { speechErrorCopy } from "@/lib/speech/errors";
import { createSupabaseConversation } from "@/lib/speech/conversation";
import type { VoiceTurnResponse } from "@/lib/speech/types";
import { toast } from "sonner";

type Props = {
  slug: string;
  onBrowse: () => void;
  locale?: string;
};

export function VoiceCashier({ slug, onBrowse, locale: preferredLocale }: Props) {
  const navigate = useNavigate();
  const items = useCartStore((state) => state.items);
  const setItems = useCartStore((state) => state.setItems);
  const getSubtotal = useCartStore((state) => state.getSubtotal);
  const getTax = useCartStore((state) => state.getTax);
  const getTotal = useCartStore((state) => state.getTotal);
  const addOrder = useOrderStore((state) => state.addOrder);

  const conversation = useRef(createSupabaseConversation());
  const speech = useRef(createBrowserSpeechToText());
  const voice = useRef(createBrowserTextToSpeech());
  const sessionId = useRef<string | null>(null);
  const placing = useRef(false);
  const completed = useRef(false);
  const abandoned = useRef(false);
  const locale = preferredLocale || (typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US");

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [partial, setPartial] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [say, setSay] = useState("");
  const [awaiting, setAwaiting] = useState(false);
  const [upsellId, setUpsellId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const leave = () => {
    if (!completed.current && !abandoned.current && items.length > 0) {
      abandoned.current = true;
      track("voice_order_abandoned", { restaurant_slug: slug, channel: "mobile_web" });
    }
    voice.current.cancel();
    speech.current.stop();
    onBrowse();
  };

  useEffect(() => {
    const onHide = () => {
      if (!completed.current && !abandoned.current && useCartStore.getState().items.length > 0) {
        abandoned.current = true;
        track("voice_order_abandoned", { restaurant_slug: slug, channel: "mobile_web" });
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    const speechInput = speech.current;
    const spokenOutput = voice.current;
    void conversation.current.startSession({ slug, channel: "mobile_web", locale }).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setSay(result.error);
        setReady(true);
        return;
      }
      sessionId.current = result.sessionId;
      setHasSession(true);
      setSpoken(result.spokenResponses);
      setSay(result.greeting);
      setReady(true);
      track("voice_session_started", { restaurant_slug: slug, channel: "mobile_web" });
      if (result.spokenResponses) spokenOutput.speak(result.greeting, locale);
    });
    return () => {
      cancelled = true;
      speechInput.stop();
      spokenOutput.cancel();
    };
  }, [slug, locale]);

  const applyTurn = (result: VoiceTurnResponse) => {
    if ("error" in result) {
      setError(result.error);
      setSay(result.error);
      return;
    }
    setError(null);
    setItems(pricedLinesToCartItems(result.lines));
    setSay(result.say);
    setAwaiting(result.awaitingConfirmation);
    setUpsellId(result.upsell?.itemId ?? null);
    if (spoken && result.say) voice.current.speak(result.say, locale);
  };

  const send = async (utterance: string, op: "turn" | "confirm" | "cancel" = "turn") => {
    const id = sessionId.current;
    if (!id || busy) return;
    setBusy(true);
    setListening(false);
    speech.current.stop();
    voice.current.cancel();
    try {
      const result = await conversation.current.turn({
        op,
        sessionId: id,
        slug,
        utterance,
        cart: cartItemsToLines(useCartStore.getState().items),
        locale,
        channel: "mobile_web",
        turnId: crypto.randomUUID(),
        pendingUpsellItemId: upsellId,
      });
      applyTurn(result);
    } finally {
      setBusy(false);
    }
  };

  const startMic = () => {
    if (!speech.current.isSupported()) {
      const copy = speechErrorCopy("unsupported", locale);
      setError(copy);
      setSay(copy);
      return;
    }
    setError(null);
    setPartial("");
    setListening(true);
    voice.current.cancel();
    speech.current.start(
      {
        onPartial: setPartial,
        onFinal: (text) => {
          setTranscript((current) => [...current, text].slice(-8));
          setPartial("");
          setDraft("");
          void send(text);
        },
        onError: (code) => {
          const copy = speechErrorCopy(code, locale);
          setError(copy);
          setSay(copy);
          setListening(false);
        },
        onEnd: () => setListening(false),
      },
      locale,
    );
  };

  const placeOrder = async () => {
    const claim = claimOnce(placing.current);
    placing.current = claim.claimed;
    if (!claim.accepted || !awaiting) return;
    const current = useCartStore.getState().items;
    if (current.length === 0) {
      placing.current = false;
      return;
    }
    setBusy(true);
    try {
      const id = sessionId.current;
      if (!id) {
        placing.current = false;
        return;
      }
      const priced = await conversation.current.turn({
        op: "confirm",
        sessionId: id,
        slug,
        cart: cartItemsToLines(current),
        locale,
        channel: "mobile_web",
        turnId: crypto.randomUUID(),
        pendingUpsellItemId: upsellId,
      });
      if ("error" in priced || !priced.awaitingConfirmation || priced.lines.length === 0) {
        applyTurn(priced);
        placing.current = false;
        return;
      }
      const confirmedItems = pricedLinesToCartItems(priced.lines);
      setItems(confirmedItems);
      track("voice_order_confirmed", { restaurant_slug: slug, channel: "mobile_web" });
      const order = await addOrder({
        truckId: slug,
        items: confirmedItems,
        subtotal: priced.subtotal,
        tax: priced.tax,
        total: priced.total,
        status: "received",
        customerName: customerName.trim() || undefined,
      });
      completed.current = true;
      useCartStore.getState().clearCart();
      track("voice_order_completed", { restaurant_slug: slug, channel: "mobile_web" });
      track("order_completed", { restaurant_slug: slug, channel: "mobile_web" });
      toast.success("Order sent to the kitchen");
      navigate(`/confirmation/${order.id}?t=${order.guestAccessToken}`);
    } catch (placeError) {
      placing.current = false;
      toast.error(friendlySupabaseError(placeError, "Could not send the order. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const onType = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTranscript((current) => [...current, text].slice(-8));
    setDraft("");
    void send(text);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="kk-kicker">Cashier</p>
          <span className="sr-only" role="status">{listening ? "Listening" : busy ? "Thinking" : "Waiting"}</span>
          <ListeningBars active={listening} />
        </div>
        <p className="text-2xl font-semibold leading-snug" aria-live="polite">
          {say || (ready ? "What can I get started for you?" : "One moment...")}
        </p>
        {(partial || transcript.length > 0) && (
          <div className="text-sm text-muted-foreground space-y-1">
            {transcript.map((line, index) => (
              <p key={`${index}-${line}`}>You: {line}</p>
            ))}
            {partial && <p>You: {partial}</p>}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            className="h-16 px-6 text-base"
            variant={listening ? "destructive" : "default"}
            disabled={!ready || busy || !hasSession}
            onClick={() => (listening ? speech.current.stop() : startMic())}
          >
            {listening ? <MicOff className="w-5 h-5 mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
            {listening ? "Listening…" : "Microphone"}
          </Button>
          {busy && <Loader2 className="w-5 h-5 animate-spin self-center" />}
        </div>
        <form onSubmit={onType} className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder="Or type your order"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-label="Type your order"
          />
          <Button type="submit" variant="outline" disabled={!hasSession || busy || !draft.trim()}>
            Send
          </Button>
        </form>
      </div>

      <div id="voice-cart" className="rounded-2xl border border-border p-4 space-y-2">
        <p className="font-medium">Your order</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          items.map((item) => {
            const mods = item.selectedModifiers.flatMap((group) => group.options.map((option) => option.name)).join(", ");
            const unit = item.menuItem.price + item.selectedModifiers.reduce((sum, group) => sum + group.options.reduce((inner, option) => inner + option.price, 0), 0);
            return (
              <div key={item.id} className="flex justify-between gap-3 text-sm">
                <span>
                  {item.quantity} {item.menuItem.name}
                  {mods ? <span className="block text-muted-foreground">{mods}</span> : null}
                </span>
                <span>${(unit * item.quantity).toFixed(2)}</span>
              </div>
            );
          })
        )}
        <div className="border-t border-border pt-2 text-sm space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>${getSubtotal().toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>${getTax().toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span>${getTotal().toFixed(2)}</span></div>
        </div>
      </div>

      {awaiting && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3">
          <p className="font-medium">Confirm this order</p>
          <p className="text-sm text-muted-foreground">Nothing is sent until you press the button.</p>
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Name for the order (optional)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-label="Name for the order"
          />
          <Button type="button" variant="cart" className="w-full" disabled={busy} onClick={() => void placeOrder()}>
            Confirm and place order · ${getTotal().toFixed(2)}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!hasSession || busy || items.length === 0} onClick={() => void send("", "confirm")}>
          Review order
        </Button>
        <Button type="button" variant="ghost" disabled={!hasSession || busy || items.length === 0} onClick={() => void send("", "cancel")}>
          <Square className="w-4 h-4 mr-2" />
          Clear order
        </Button>
        <Button type="button" variant="outline" onClick={() => document.getElementById('voice-cart')?.scrollIntoView({ behavior: 'smooth' })}>
          View cart
        </Button>
        <Button type="button" variant="ghost" onClick={leave}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ListeningBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-1 h-6" aria-hidden>
      {[0, 1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={`w-1 rounded-full bg-primary ${active ? "animate-pulse" : "opacity-30"}`}
          style={{ height: active ? 8 + ((bar * 5) % 16) : 6 }}
        />
      ))}
    </div>
  );
}
