/**
 * Ant Design theme in the LKDR games brand: Nunito, a night-purple sidebar, violet actions and the
 * same sun yellow as the visitor apps for highlights. Calm and clear for staff, not stock Ant Design.
 * Every colour and radius is set here once, so pages never style components by hand.
 */
import type { ThemeConfig } from 'antd';

export const BRAND = '#5a3ad1';
export const NIGHT = '#170e3f';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: BRAND,
    colorInfo: BRAND,
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorText: '#0a0a0b',
    colorTextSecondary: '#52525b',
    colorTextTertiary: '#71717a',
    colorBorder: '#e4e4e7',
    colorBorderSecondary: '#f0f0f2',
    colorBgLayout: '#f6f4fb',
    colorFillSecondary: '#f4f4f5',
    fontFamily: '"Nunito Variable", ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: 14,
    borderRadius: 10,
    borderRadiusLG: 16,
    controlHeight: 36,
    boxShadowTertiary: '0 1px 2px rgb(0 0 0 / 0.04)',
    motionDurationMid: '0.18s',
  },
  components: {
    Layout: { siderBg: NIGHT, headerBg: '#ffffff', bodyBg: '#f6f4fb' },
    Menu: {
      darkItemBg: NIGHT,
      darkSubMenuItemBg: NIGHT,
      darkItemColor: '#b9a8ff',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
      darkItemSelectedBg: '#ffcd1f',
      darkItemSelectedColor: '#3a2400',
      darkGroupTitleColor: '#8f7fd6',
      itemBorderRadius: 10,
      itemHeight: 38,
      groupTitleFontSize: 11,
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#52525b',
      headerSplitColor: 'transparent',
      rowHoverBg: '#fafafa',
    },
    Card: { headerFontSize: 15 },
    Button: { primaryShadow: '0 4px 0 #3d24a0', defaultShadow: 'none', fontWeight: 700 },
    Tag: { defaultBg: '#efeafc' },
    Statistic: { contentFontSize: 26 },
  },
};
