/**
 * The ten roles, and what the application understands about them.
 *
 * The database is the authority — `role_permissions` decides what is allowed.
 * This file exists so the UI can route, label and group without a round trip,
 * and it must stay in step with migration 0019.
 */
export const ROLES = [
  'customer',
  'business_owner', 'business_staff', 'tour_operator', 'hotel_manager',
  'content_manager', 'booking_manager', 'support_agent',
  'admin', 'super_admin',
] as const;

export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = [
  'pending_verification', 'active', 'suspended', 'deactivated', 'banned',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ROLE_META: Record<Role, { label: string; group: 'customer' | 'business' | 'internal'; home: string }> = {
  customer:        { label: 'Customer',        group: 'customer', home: '/account' },
  business_owner:  { label: 'Business owner',  group: 'business', home: '/dashboard' },
  business_staff:  { label: 'Business staff',  group: 'business', home: '/dashboard' },
  tour_operator:   { label: 'Tour operator',   group: 'business', home: '/dashboard' },
  hotel_manager:   { label: 'Hotel manager',   group: 'business', home: '/dashboard' },
  content_manager: { label: 'Content manager', group: 'internal', home: '/admin/posts' },
  booking_manager: { label: 'Booking manager', group: 'internal', home: '/admin' },
  support_agent:   { label: 'Support agent',   group: 'internal', home: '/admin/leads' },
  admin:           { label: 'Admin',           group: 'internal', home: '/admin' },
  super_admin:     { label: 'Super admin',     group: 'internal', home: '/admin' },
};

export const PERMISSIONS = [
  'listings.read.all', 'listings.write.own', 'listings.publish', 'listings.moderate',
  'bookings.read.own', 'bookings.read.all', 'bookings.manage',
  'payments.read', 'payments.refund',
  'content.write', 'content.publish',
  'reviews.moderate', 'reviews.reply.own',
  'leads.read', 'leads.manage', 'support.impersonate',
  'users.read', 'users.suspend', 'users.assign_roles',
  'businesses.approve', 'settings.write', 'analytics.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const INTERNAL: Role[] = ['content_manager', 'booking_manager', 'support_agent', 'admin', 'super_admin'];
const BUSINESS: Role[] = ['business_owner', 'business_staff', 'tour_operator', 'hotel_manager'];

export const isInternalRole = (role: Role) => INTERNAL.includes(role);
export const isBusinessRole = (role: Role) => BUSINESS.includes(role);

/** Where to send someone after they sign in. */
export const homeForRole = (role: Role) => ROLE_META[role]?.home ?? '/account';

/**
 * Which route prefixes each role may enter. Checked at the edge so a
 * mis-routed link fails fast — but this is a courtesy, not the boundary.
 * RLS is the boundary; deleting this file would leak nothing.
 */
export const ROUTE_ACCESS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/admin', roles: INTERNAL },
  { prefix: '/dashboard', roles: [...BUSINESS, ...INTERNAL] },
  { prefix: '/account', roles: [...ROLES] },
];

export function canEnter(path: string, role: Role): boolean {
  const rule = ROUTE_ACCESS.find((r) => path.startsWith(r.prefix));
  return rule ? rule.roles.includes(role) : true;
}
