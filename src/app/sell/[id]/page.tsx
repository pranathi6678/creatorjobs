import { getSeller, listListingsForSeller } from "@/lib/db";
import { notFound } from "next/navigation";
import SellerActions from "./SellerActions";
import NewListingForm from "./NewListingForm";

export default async function SellerDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { id } = await params;
  const { onboarding } = await searchParams;
  const seller = await getSeller(id);
  if (!seller) notFound();
  const listings = await listListingsForSeller(id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{seller.name}&apos;s seller dashboard</h1>
        <p className="text-sm text-neutral-500">{seller.email}</p>
        {onboarding === "complete" && (
          <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Welcome back from Whop onboarding — syncing your verification status below.
          </p>
        )}
      </div>

      <SellerActions seller={seller} autoSync={onboarding === "complete"} />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Your listings</h2>
        </div>
        <NewListingForm sellerId={seller.id} />
        <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {listings.length === 0 && (
            <li className="px-4 py-3 text-sm text-neutral-500">No listings yet.</li>
          )}
          {listings.map((l) => (
            <li key={l.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{l.title}</div>
                <div className="text-sm text-neutral-500">
                  ${(l.price_cents / 100).toFixed(2)} · {l.status}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
