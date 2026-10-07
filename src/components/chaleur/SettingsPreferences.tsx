"use client";

import { useEffect, useState } from "react";
import { EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Row, blurOnEnter } from "@/components/chaleur/SettingsRow";
import { AREA_LABELS, type Tab } from "@/lib/access";
import { cn } from "@/lib/utils";

export type PrefsView = {
  hiddenTabs: Tab[];
  stockStage: "ready" | "out" | "completed";
  allowPaid: boolean;
  allowUnpaid: boolean;
  collectUnpaid: boolean;
  prepMethod: "manual" | "scan";
  trackingDays: number;
};

function RadioCard({
  name,
  checked,
  disabled,
  title,
  description,
  onSelect,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3",
        checked ? "border-primary bg-blue-50/40" : "border-border hover:border-gray-300",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input type="radio" name={name} className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={onSelect} />
      <span>
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="mt-0.5 block text-xs text-gray-600">{description}</span>
      </span>
    </label>
  );
}

export function PreferencesSection({
  tab,
  prefs,
  main,
  canEdit,
  save,
}: {
  tab: Tab;
  prefs: PrefsView;
  main: boolean;
  canEdit: boolean;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const hidden = prefs.hiddenTabs.includes(tab);
  const label = AREA_LABELS[tab];
  const [days, setDays] = useState(String(prefs.trackingDays));
  useEffect(() => setDays(String(prefs.trackingDays)), [prefs.trackingDays]);

  return (
    <>
      <Row
        title={`Show the ${label} tab`}
        hint={
          tab === "storage"
            ? "Always shown. Storage is the one tab that can’t be hidden."
            : main
              ? "Only you, the main user, can hide tabs. A hidden tab disappears for everyone."
              : "Only the main user can hide or show tabs."
        }
      >
        {tab === "storage" && <Lock className="size-4 text-gray-500" aria-label="Locked" />}
        <Switch
          aria-label={`Show the ${label} tab`}
          checked={!hidden}
          disabled={tab === "storage" || !main}
          onCheckedChange={(show) =>
            void save({ hiddenTabs: show ? prefs.hiddenTabs.filter((t) => t !== tab) : [...prefs.hiddenTabs, tab] })
          }
        />
      </Row>

      {hidden && (
        <div className="flex max-w-[720px] flex-col items-center gap-2 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-md bg-gray-100">
            <EyeOff className="size-5 text-gray-500" />
          </span>
          <p className="text-md font-semibold text-gray-900">{label} is hidden</p>
          <p className="text-sm text-gray-600">
            {tab === "tasks" || tab === "reports"
              ? "Its settings will show up here once the tab is ready."
              : "Show it again above to use it."}
          </p>
        </div>
      )}

      {tab === "delivery" && !hidden && (
        <>
          <Row
            stacked
            title="Take items out of stock"
            hint="Until then, the units stay reserved for the invoice, also while an order is delayed. With split deliveries, only the units in each delivery leave stock."
          >
            <div className="grid w-full gap-2">
              <RadioCard
                name="stock-stage"
                checked={prefs.stockStage === "ready"}
                disabled={!canEdit}
                title="When ready"
                description="As soon as the items are prepared and the delivery moves to Processing."
                onSelect={() => void save({ stockStage: "ready" })}
              />
              <RadioCard
                name="stock-stage"
                checked={prefs.stockStage === "out"}
                disabled={!canEdit}
                title="When out for delivery"
                description="When the driver leaves. Collections leave stock when they’re picked up."
                onSelect={() => void save({ stockStage: "out" })}
              />
              <RadioCard
                name="stock-stage"
                checked={prefs.stockStage === "completed"}
                disabled={!canEdit}
                title="When completed · recommended"
                description="Only after the delivery or collection is confirmed with a photo."
                onSelect={() => void save({ stockStage: "completed" })}
              />
            </div>
          </Row>
          <Row stacked title="Preparation" hint="How the warehouse confirms what it took from the shelves before an order moves to Processing.">
            <div className="grid w-full gap-2">
              <RadioCard
                name="prep-method"
                checked={prefs.prepMethod === "manual"}
                disabled={!canEdit}
                title="Type the quantities"
                description="Count each product and type how many units you took. Use this until barcode scanning is set up."
                onSelect={() => void save({ prepMethod: "manual" })}
              />
              <RadioCard
                name="prep-method"
                checked={prefs.prepMethod === "scan"}
                disabled={!canEdit}
                title="Scan barcodes"
                description="Scan every unit with the barcode reader. Each scan counts one unit."
                onSelect={() => void save({ prepMethod: "scan" })}
              />
            </div>
          </Row>
          <Row title="Paid invoices" hint="Fully paid in QuickBooks. They can be prepared and delivered.">
            <Switch aria-label="Paid invoices" checked={prefs.allowPaid} disabled={!canEdit} onCheckedChange={(on) => void save({ allowPaid: on })} />
          </Row>
          <Row title="Unpaid invoices" hint="Open or partly paid. When off, they wait in New as “Waiting for payment” until QuickBooks marks them paid.">
            <Switch aria-label="Unpaid invoices" checked={prefs.allowUnpaid} disabled={!canEdit} onCheckedChange={(on) => void save({ allowUnpaid: on })} />
          </Row>
          <Row title="Collect unpaid invoices" hint="Customers can pay when they pick up, even with unpaid invoices off.">
            <Switch
              aria-label="Collect unpaid invoices"
              checked={prefs.collectUnpaid}
              disabled={!canEdit}
              onCheckedChange={(on) => void save({ collectUnpaid: on })}
            />
          </Row>
          <Row title="Tracking links" hint="A customer’s link stops working this many days after the last delivery. One link per invoice.">
            <Input
              type="number"
              min={1}
              max={90}
              aria-label="Days a tracking link lasts after delivery"
              className="w-20 text-right tabular-nums"
              disabled={!canEdit}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              onKeyDown={blurOnEnter}
              onBlur={() => {
                const next = Math.round(Number(days));
                if (next === prefs.trackingDays) return;
                if (next >= 1 && next <= 90) void save({ trackingDays: next });
                else setDays(String(prefs.trackingDays));
              }}
            />
            <span className="text-sm text-gray-600">days</span>
          </Row>
        </>
      )}
    </>
  );
}
