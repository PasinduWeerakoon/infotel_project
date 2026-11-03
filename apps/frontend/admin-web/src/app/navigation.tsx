/**
 * Sidebar groups and which roles see them (docs: 05-admin-dashboard). Super admins see everything.
 */
import {
  IconAdjustments,
  IconCalendarEvent,
  IconChartBar,
  IconDeviceTv,
  IconGift,
  IconLayoutDashboard,
  IconListNumbers,
  IconTicket,
  IconTrophy,
  IconUsers,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { Role } from '../api/platform';

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const icon = (Component: typeof IconGift) => <Component size={18} stroke={1.7} />;
const ALL: Role[] = ['games-admin', 'hunt-admin', 'prize-desk', 'viewer'];

export const NAVIGATION: NavGroup[] = [
  { title: null, items: [{ path: '/', label: 'Overview', icon: icon(IconLayoutDashboard), roles: ALL }] },
  {
    title: 'GAMES EVENT',
    items: [
      {
        path: '/games/sessions',
        label: 'Sessions',
        icon: icon(IconCalendarEvent),
        roles: ['games-admin', 'viewer'],
      },
      {
        path: '/games/prizes',
        label: 'Prize catalogue',
        icon: icon(IconGift),
        roles: ['games-admin', 'viewer'],
      },
      {
        path: '/games/allocation',
        label: 'Allocation',
        icon: icon(IconListNumbers),
        roles: ['games-admin', 'viewer'],
      },
      { path: '/games/logos', label: 'Logos and screens', icon: icon(IconDeviceTv), roles: ['games-admin'] },
      {
        path: '/games/plays',
        label: 'Plays and reports',
        icon: icon(IconChartBar),
        roles: ['games-admin', 'viewer'],
      },
      { path: '/games/settings', label: 'Game rules', icon: icon(IconAdjustments), roles: ['games-admin'] },
    ],
  },
  {
    title: 'TREASURE HUNT',
    items: [
      {
        path: '/hunt/sessions',
        label: 'Sessions',
        icon: icon(IconCalendarEvent),
        roles: ['hunt-admin', 'viewer'],
      },
      // Stalls is hidden for now, the page stays in pages/hunt/StallsPage.tsx
      {
        path: '/hunt/winners',
        label: 'Leaderboard and winners',
        icon: icon(IconTrophy),
        roles: ['hunt-admin', 'viewer'],
      },
    ],
  },
  {
    title: 'PRIZE DESK',
    items: [
      {
        path: '/desk',
        label: 'Prize desk',
        icon: icon(IconTicket),
        roles: ['games-admin', 'hunt-admin', 'prize-desk'],
      },
    ],
  },
  {
    title: 'ADMIN',
    items: [{ path: '/users', label: 'Users and roles', icon: icon(IconUsers), roles: [] }],
  },
];

/** Super admins can do everything. Other roles only what is listed. */
export const hasRole = (role: Role, roles: Role[]) => role === 'super-admin' || roles.includes(role);

export const canSee = (role: Role, item: NavItem) => hasRole(role, item.roles);

/** Navigation for one role, with empty groups removed. */
export function navigationFor(role: Role): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(role, item)),
  })).filter((group) => group.items.length > 0);
}
