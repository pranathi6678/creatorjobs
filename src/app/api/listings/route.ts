import { NextRequest, NextResponse } from "next/server";
import { createListing } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sellerId, title, description, priceUsd, whopPlanId } = body as {
    sellerId?: string;
    title?: string;
    description?: string;
    priceUsd?: number;
    whopPlanId?: string;
  };

  if (!sellerId || !title || !priceUsd || priceUsd <= 0) {
    return NextResponse.json({ error: "sellerId, title, and a positive priceUsd are required" }, { status: 400 });
  }

  const listing = await createListing({
    sellerId,
    title,
    description: description ?? "",
    priceCents: Math.round(priceUsd * 100),
    currency: "usd",
    whopPlanId,
  });

  return NextResponse.json({ listing });
}
