import { NextRequest, NextResponse } from "next/server";
import { createSeller, updateSeller } from "@/lib/db";
import { createAccountLink, createConnectedAccount } from "@/lib/whop";

// Creates a seller row, provisions a Whop connected account (sub-company) for
// them, and returns a hosted KYC onboarding link. If WHOP_API_KEY isn't
// configured yet (no live Whop credentials), the seller row is still created
// so the rest of the app is demoable, and whop_company_id stays null.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email } = body as { name?: string; email?: string };
  if (!name || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  const seller = await createSeller({ name, email });

  if (!process.env.WHOP_API_KEY || !process.env.WHOP_PLATFORM_COMPANY_ID) {
    return NextResponse.json({
      seller,
      onboardingUrl: null,
      note: "WHOP_API_KEY / WHOP_PLATFORM_COMPANY_ID not configured — seller created locally only.",
    });
  }

  try {
    const account = await createConnectedAccount({
      title: name,
      email,
      metadata: { creatorjobs_seller_id: seller.id },
    });
    await updateSeller(seller.id, { whop_company_id: account.id, kyc_status: "pending" });

    const origin = req.nextUrl.origin;
    const link = await createAccountLink({
      companyId: account.id,
      useCase: "account_onboarding",
      returnUrl: `${origin}/sell/${seller.id}?onboarding=complete`,
      refreshUrl: `${origin}/sell/${seller.id}?onboarding=refresh`,
    });

    return NextResponse.json({ seller: { ...seller, whop_company_id: account.id }, onboardingUrl: link.url });
  } catch (err) {
    return NextResponse.json(
      { seller, onboardingUrl: null, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
