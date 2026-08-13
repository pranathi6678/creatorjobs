import { NextRequest, NextResponse } from "next/server";
import { markWebhookEvent, recordWebhookEvent, transitionOrder } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/whop";
import { processWhopEvent } from "@/lib/webhookProcessor";

// Whop webhook receiver. Order of operations matters here:
// 1. Verify signature over the RAW body before touching anything (never trust
//    a parsed/re-serialized body for signature checks).
// 2. Record the event keyed on the `webhook-id` header first, so a retried
//    delivery is detected as a duplicate even if we crash mid-processing.
// 3. Apply the state change through the order state machine, which itself
//    rejects illegal/out-of-order transitions.
// 4. Always return 2xx once the event is durably recorded, even if we ignore
//    it — a non-2xx here just makes Whop retry an event we already logged.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const webhookId = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signature = req.headers.get("webhook-signature");

  if (!webhookId || !timestamp || !signature) {
    return NextResponse.json({ error: "missing webhook headers" }, { status: 400 });
  }

  let verified = false;
  try {
    verified = verifyWebhookSignature({ rawBody, webhookId, timestamp, signatureHeader: signature });
  } catch {
    // Missing WHOP_WEBHOOK_SECRET in this environment — surface as 500 so it's
    // loud in logs/dashboard rather than silently accepting unverified events.
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }
  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const { isDuplicate, id: logId } = await recordWebhookEvent({
    whopWebhookId: webhookId,
    eventType: event.type,
    payload: event,
  });

  if (isDuplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await processWhopEvent(event, transitionOrder);
    await markWebhookEvent(logId, result.applied ? "processed" : "ignored", { orderId: result.orderId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await markWebhookEvent(logId, "error", { error: err instanceof Error ? err.message : String(err) });
    // Still 200: the event is logged with status=error and visible on the
    // dashboard for a human/engineer to triage, rather than making Whop hammer
    // retries for something a retry won't fix (e.g. an order that doesn't exist).
    return NextResponse.json({ ok: false, error: "processing_failed" });
  }
}
