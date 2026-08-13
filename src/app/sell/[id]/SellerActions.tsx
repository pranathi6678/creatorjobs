"use client";

import { useEffect, useState } from "react";
import type { Seller } from "@/lib/db";

const KYC_LABEL: Record<Seller["kyc_status"], string> = {
  not_started: "Not started",
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Rejected — needs resubmission",
};

const KYC_COLOR: Record<Seller["kyc_status"], string> = {
  not_started: "bg-neutral-100 text-neutral-700",
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function SellerActions({ seller, autoSync }: { seller: Seller; autoSync: boolean }) {
  const [current, setCurrent] = useState(seller);
  const [syncing, setSyncing] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/seller/${seller.id}/sync`, { method: "POST" });
      const data = await res.json();
      if (data.seller) setCurrent(data.seller);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (autoSync) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

  async function openPayoutPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch(`/api/seller/${seller.id}/payout-link`, { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error ?? "Could not create payout portal link");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${KYC_COLOR[current.kyc_status]}`}>
        KYC: {KYC_LABEL[current.kyc_status]}
      </span>
      <button
        onClick={sync}
        disabled={syncing || !current.whop_company_id}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        {syncing ? "Checking..." : "Refresh verification status"}
      </button>
      <button
        onClick={openPayoutPortal}
        disabled={portalLoading || current.kyc_status !== "verified"}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        title={current.kyc_status !== "verified" ? "Complete KYC verification first" : ""}
      >
        {portalLoading ? "Opening..." : "Add payout method / withdraw"}
      </button>
      {!current.whop_company_id && (
        <span className="text-xs text-neutral-500">
          No Whop connected account yet — WHOP_API_KEY isn&apos;t configured in this environment.
        </span>
      )}
    </div>
  );
}
