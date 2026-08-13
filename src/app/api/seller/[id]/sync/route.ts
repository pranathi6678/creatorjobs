import { NextRequest, NextResponse } from "next/server";
import { getSeller, updateSeller } from "@/lib/db";

// Called when the seller returns from the Whop-hosted KYC flow. Whop doesn't
// push a dedicated "kyc.completed" webhook in the documented event list, so
// the reliable way to pick up the new status is to re-fetch the connected
// account (`GET /companies/{id}`, `verified` field) right after redirect —
// this route does that. In production you'd also re-run this from a nightly
// reconciliation job in case the buyer closes the tab before returning.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await getSeller(id);
  if (!seller) return NextResponse.json({ error: "seller not found" }, { status: 404 });
  if (!seller.whop_company_id || !process.env.WHOP_API_KEY) {
    return NextResponse.json({ seller, note: "No Whop connected account to sync yet." });
  }

  try {
    const res = await fetch(
      `${process.env.WHOP_ENV === "production" ? "https://api.whop.com/api/v1" : "https://sandbox-api.whop.com/api/v1"}/companies/${seller.whop_company_id}`,
      { headers: { Authorization: `Bearer ${process.env.WHOP_API_KEY}` } }
    );
    if (!res.ok) throw new Error(`Whop returned ${res.status}`);
    const company = await res.json();
    const updated = await updateSeller(id, {
      kyc_status: company.verified ? "verified" : "pending",
    });
    return NextResponse.json({ seller: updated });
  } catch (err) {
    return NextResponse.json(
      { seller, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
