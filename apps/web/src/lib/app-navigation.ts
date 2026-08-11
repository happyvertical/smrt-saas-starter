export interface AppNavigationItem {
  href: string;
  label: string;
  icon: string;
  permission: string;
  heading: string;
}

/**
 * Single source for rendered app navigation and production route coverage.
 * Adding a destination here automatically adds it to the Playwright crawl.
 */
export const APP_NAVIGATION: readonly AppNavigationItem[] = [
  {
    href: "/app",
    label: "Overview",
    icon: "bar-chart",
    permission: "tenant.read",
    heading: "Tenant overview",
  },
  {
    href: "/app/billing",
    label: "Billing",
    icon: "credit-card",
    permission: "tenant.billing.read",
    heading: "Plans and subscription",
  },
  {
    href: "/app/usage",
    label: "Usage",
    icon: "gauge",
    permission: "tenant.usage.read",
    heading: "Tenant metrics",
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: "settings",
    permission: "tenant.settings.read",
    heading: "Tenant configuration",
  },
  {
    href: "/app/settings/field-policies",
    label: "Field settings",
    icon: "sliders-horizontal",
    permission: "tenant.settings.read",
    heading: "Field settings",
  },
  {
    href: "/app/admin",
    label: "Admin",
    icon: "settings",
    permission: "super-user",
    heading: "Starter administration",
  },
];
