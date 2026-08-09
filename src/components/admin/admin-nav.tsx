import Link from 'next/link';
import {
  LayoutDashboard, BarChart3, Inbox, Home, Building2, MapPin, Wrench, Star,
  HelpCircle, Package, Upload, ShieldCheck, Users, Award, FileText, Files,
  Menu as MenuIcon, Image as ImageIcon, Palette, Search, Code2, UserCog, Tag,
} from 'lucide-react';

export type NavItem = {
  href: string; label: string; icon: React.ComponentType<{ className?: string }>;
  built: boolean; count?: number;
};

/**
 * The admin sidebar.
 *
 * Sections that are not built yet are shown but marked and not linked. Hiding
 * them would misrepresent the product; linking them would send an admin to a
 * dead page. Saying "not built yet" is the honest third option, and it doubles
 * as the roadmap.
 */
export function adminNav(prefix: string, counts: Record<string, number> = {}): Array<{ group: string; items: NavItem[] }> {
  return [
    {
      group: 'General',
      items: [
        { href: `${prefix}/admin`, label: 'Dashboard', icon: LayoutDashboard, built: true },
        { href: `${prefix}/admin/leads`, label: 'Leads', icon: Inbox, built: true, count: counts.leads },
        { href: `${prefix}/admin/analytics`, label: 'Analytics', icon: BarChart3, built: false },
        { href: `${prefix}/admin/homepage`, label: 'Homepage', icon: Home, built: false },
        { href: `${prefix}/admin/business-info`, label: 'Business info', icon: Building2, built: false },
      ],
    },
    {
      group: 'Content',
      items: [
        { href: `${prefix}/admin/posts`, label: 'Posts', icon: FileText, built: true, count: counts.posts },
        { href: `${prefix}/admin/pages`, label: 'Custom pages', icon: Files, built: false },
        { href: `${prefix}/admin/locations`, label: 'Locations', icon: MapPin, built: true, count: counts.locations },
        { href: `${prefix}/admin/services`, label: 'Services', icon: Wrench, built: false },
        { href: `${prefix}/admin/faqs`, label: 'FAQs', icon: HelpCircle, built: false },
      ],
    },
    {
      group: 'Directory',
      items: [
        { href: `${prefix}/admin/tours`, label: 'Listings', icon: Package, built: true, count: counts.tours },
        { href: `${prefix}/admin/applications`, label: 'Business owners', icon: Users, built: true, count: counts.applications },
        { href: `${prefix}/admin/claims`, label: 'Claims', icon: ShieldCheck, built: false, count: counts.claims },
        { href: `${prefix}/admin/reviews`, label: 'Review moderation', icon: Star, built: false, count: counts.reviews },
        { href: `${prefix}/admin/featured`, label: 'Featured', icon: Award, built: false },
        { href: `${prefix}/admin/import`, label: 'Import listings', icon: Upload, built: false },
      ],
    },
    {
      group: 'Site',
      items: [
        { href: `${prefix}/admin/menus`, label: 'Menus', icon: MenuIcon, built: true },
        { href: `${prefix}/admin/media`, label: 'Media library', icon: ImageIcon, built: false },
        { href: `${prefix}/admin/settings/theme`, label: 'Theme & CSS', icon: Palette, built: true },
        { href: `${prefix}/admin/settings/seo`, label: 'Sitemap & robots', icon: Search, built: true },
        { href: `${prefix}/admin/settings/scripts`, label: 'Header scripts', icon: Code2, built: true },
        { href: `${prefix}/admin/team`, label: 'Team', icon: UserCog, built: false },
      ],
    },
  ];
}

export function AdminNav({ groups, current }: { groups: ReturnType<typeof adminNav>; current: string }) {
  return (
    <nav aria-label="Admin" className="flex w-56 shrink-0 flex-col gap-5 pe-4">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col gap-1">
          <p className="px-3 text-[var(--text-xs)] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
            {group.group}
          </p>
          <ul className="flex flex-col">
            {group.items.map((item) => {
              const active = current === item.href;

              if (!item.built) {
                return (
                  <li key={item.href}>
                    <span
                      title="Not built yet"
                      className="flex cursor-default items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-[var(--text-sm)] text-[var(--ink-faint)] opacity-55"
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      <span className="ms-auto text-[10px] uppercase tracking-wide">soon</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-[var(--text-sm)] transition-colors ${
                      active
                        ? 'bg-[var(--teal)] font-medium text-white'
                        : 'text-[var(--ink-soft)] hover:bg-[var(--limestone)]'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {item.count ? (
                      <span className={`ms-auto rounded-full px-1.5 text-[var(--text-xs)] ${
                        active ? 'bg-white/20' : 'bg-[var(--brass-wash)] text-[var(--brass)]'
                      }`}>
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
