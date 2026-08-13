import { NextRequest, NextResponse } from "next/server";
import { transitionOrder } from "@/lib/db";

// Ops/seller marks an order fulfilled (work delivered) after payment cleared.
// paid -> fulfilled is the only legal transition here; the state machine in
// lib/orderState.ts rejects anything else (e.g. fulfilling a still-pending order).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await transitionOrder(id, "fulfilled", { fulfilled_at: new Date().toISOString() });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ order: result.order });
}
