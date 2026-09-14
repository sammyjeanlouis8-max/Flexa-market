import { Truck, CheckCircle2, ShieldCheck, Clock, Package, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const getCarrierUrl = (carrier: string, trackingNumber: string) => {
  const num = encodeURIComponent(trackingNumber);
  const normalized = carrier.trim().toUpperCase();

  if (normalized.includes("USPS")) {
    return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${num}`;
  }
  if (normalized === "UPS" || normalized.startsWith("UPS ")) {
    return `https://www.ups.com/track?tracknum=${num}`;
  }
  if (normalized.includes("FEDEX")) {
    return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${num}`;
  }
  if (normalized.includes("DHL")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${num}`;
  }

  return null;
};

export const FulfillmentBadge = ({
  status,
  type = "order",
  className,
}: {
  status: string;
  type?: "order" | "tracking" | "delivery";
  className?: string;
}) => {
  let label = status;
  let color = "bg-muted text-muted-foreground border-border";
  let Icon = Clock;

  if (type === "order") {
    switch (status) {
      case "pending":
        label = "Pending";
        color = "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
        Icon = Clock;
        break;
      case "ready_to_ship":
        label = "Ready to Ship";
        color = "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
        Icon = Package;
        break;
      case "shipped":
        label = "Shipped";
        color = "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800";
        Icon = Truck;
        break;
      case "delivered":
        label = "Delivered";
        color = "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800";
        Icon = CheckCircle2;
        break;
      case "completed":
        label = "Completed";
        color = "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800";
        Icon = ShieldCheck;
        break;
      case "cancelled":
        label = "Cancelled";
        color = "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800";
        Icon = XCircle;
        break;
      default:
        // Handle custom unknown statuses by splitting and capitalizing
        label = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        break;
    }
  } else if (type === "tracking") {
    switch (status) {
      case "pending":
        label = "Pending";
        color = "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-800";
        Icon = Clock;
        break;
      case "in_transit":
        label = "In Transit";
        color = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
        Icon = Truck;
        break;
      case "out_for_delivery":
        label = "Out for Delivery";
        color = "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800";
        Icon = Package;
        break;
      case "delivered":
        label = "Delivered";
        color = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800";
        Icon = CheckCircle2;
        break;
      case "exception":
        label = "Exception";
        color = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800";
        Icon = AlertTriangle;
        break;
      default:
        label = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        break;
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border", color, className)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
};
