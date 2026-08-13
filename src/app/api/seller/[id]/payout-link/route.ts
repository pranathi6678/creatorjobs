import { NextRequest, NextResponse } from "next/server";
import { getSeller } from "@/lib/db";
import { createAccountLink } from "@/lib/whop";

// Generates the hosted "payouts portal" link where a seller adds a payout
// method and can self-serve withdraw. Docs: developer/platforms/render-payout-portal
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await getSeller(id);
  if (!seller) return NextResponse.json({ error: "seller not found" }, { status: 404 });
  if (!seller.whop_company_id) {
    return NextResponse.json({ error: "seller has no connected Whop account yet" }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  try {
    const link = await createAccountLink({
      companyId: seller.whop_company_id,
      useCase: "payouts_portal",
      returnUrl: `${origin}/sell/${seller.id}`,
      refreshUrl: `${origin}/sell/${seller.id}`,
    });
    return NextResponse.json({ url: link.url });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
