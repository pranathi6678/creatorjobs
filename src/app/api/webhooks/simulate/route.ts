import { NextRequest, NextResponse } from "next/server";
import { markWebhookEvent, recordWebhookEvent, transitionOrder } from "@/lib/db";
import { processWhopEvent } from "@/lib/webhookProcessor";

// Debug tool for the ops dashboard, mirroring Whop's own `POST
// /webhooks/{id}/test` — lets a CSM/engineer replay an event against an order
// without needing a live Whop payment. Runs through the exact same
// processWhopEvent() + state machine as real traffic; the only thing skipped
// is signature verification, since there's no real Whop delivery to sign.
// whop_webhook_id is prefixed "sim_" so simulated events are visually
// distinguishable from real ones in the webhook log.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { orderId, eventType } = body as { orderId?: string; eventType?: string };
  if (!orderId || !eventType) {
    return NextResponse.json({ error: "orderId and eventType are required" }, { status: 400 });
  }

  const event = {
    id: `sim_${crypto.randomUUID()}`,
    type: eventType,
    api_version: "v1",
    timestamp: new Date().toISOString(),
    data: { id: `sim_pay_${crypto.randomUUID().slice(0, 8)}`, metadata: { order_id: orderId } },
  };

  const { isDuplicate, id: logId } = await recordWebhookEvent({
    whopWebhookId: event.id,
    eventType: event.type,
    payload: event,
  });
  if (isDuplicate) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const result = await processWhopEvent(event, transitionOrder);
    await markWebhookEvent(logId, result.applied ? "processed" : "ignored", { orderId: result.orderId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await markWebhookEvent(logId, "error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
