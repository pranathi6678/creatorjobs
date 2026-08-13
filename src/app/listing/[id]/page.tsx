import { getListing, getSeller } from "@/lib/db";
import { notFound } from "next/navigation";
import CheckoutForm from "./CheckoutForm";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing || listing.status !== "active") notFound();
  const seller = await getSeller(listing.seller_id);

  return (
    <div className="mx-auto max-w-lg">
      <div className="text-xs uppercase tracking-wide text-neutral-400">
        by {seller?.name ?? "Unknown seller"}
      </div>
      <h1 className="mt-1 text-2xl font-semibold">{listing.title}</h1>
      <p className="mt-3 whitespace-pre-wrap text-neutral-700">{listing.description}</p>
      <div className="mt-4 text-2xl font-semibold">
        ${(listing.price_cents / 100).toFixed(2)} {listing.currency.toUpperCase()}
      </div>

      <div className="mt-8">
        <CheckoutForm listingId={listing.id} whopPlanId={listing.whop_plan_id} />
      </div>
    </div>
  );
}
