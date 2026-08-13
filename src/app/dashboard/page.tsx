import { listOrdersForDashboard, listWebhookEvents } from "@/lib/db";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [orders, webhookEvents] = await Promise.all([listOrdersForDashboard(), listWebhookEvents()]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Marketplace ops dashboard</h1>
      <p className="mt-1 text-neutral-600">
        Buyer payment, order state, seller payout status, and webhook delivery/errors in one
        place — so ops doesn&apos;t have to guess what happened to an order.
      </p>
      <DashboardClient orders={orders} webhookEvents={webhookEvents} />
    </div>
  );
}
