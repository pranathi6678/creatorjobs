"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewListingForm({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [whopPlanId, setWhopPlanId] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId,
          title,
          description,
          priceUsd: parseFloat(price),
          whopPlanId: whopPlanId || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setTitle("");
      setDescription("");
      setPrice("");
      setWhopPlanId("");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      >
        + New listing
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <input
        required
        placeholder="Title (e.g. Logo design)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-3">
        <input
          required
          type="number"
          min="1"
          step="0.01"
          placeholder="Price (USD)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Whop Plan ID (optional — plan_xxx from dashboard)"
          value={whopPlanId}
          onChange={(e) => setWhopPlanId(e.target.value)}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save listing"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-neutral-500">
          Cancel
        </button>
      </div>
    </form>
  );
}
