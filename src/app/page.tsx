import Link from "next/link";
import { listActiveListings } from "@/lib/db";

export default async function HomePage() {
  const listings = await listActiveListings();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Hire a creator</h1>
        <p className="mt-1 text-neutral-600">
          Buyers pay for work here; sellers get paid out through Whop.
        </p>
      </div>

      {listings.length === 0 ? (
        <p className="text-neutral-500">
          No listings yet. <Link href="/sell" className="underline">Become a seller</Link> to add one.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/listing/${listing.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-400"
            >
              <div className="text-xs uppercase tracking-wide text-neutral-400">
                by {listing.seller_name}
              </div>
              <div className="mt-1 font-medium">{listing.title}</div>
              <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{listing.description}</p>
              <div className="mt-3 font-semibold">
                ${(listing.price_cents / 100).toFixed(2)} {listing.currency.toUpperCase()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
