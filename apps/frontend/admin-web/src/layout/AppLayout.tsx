/**
 * Signed-in frame: sidebar with the role's navigation, and the page area.
 * On narrow screens the sidebar collapses into a drawer.
 */
import { IconLogout, IconMenu2 } from '@tabler/icons-react';
import { Avatar, Button, Drawer, Grid, Layout, Menu, Typography } from 'antd';
import { type ReactNode, Suspense, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ROLE_LABELS, platformApi } from '../api/platform';
import { useAuth } from '../app/auth';
import { navigationFor } from '../app/navigation';
import { NIGHT } from '../app/theme';
import { PageLoading } from '../components/PageLoading';

const { Sider, Content } = Layout;

export function AppLayout() {
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isDesktop = screens.lg !== false;

  const sidebar = <Sidebar onNavigate={() => setDrawerOpen(false)} />;

  return (
    <Layout style={{ minHeight: '100dvh' }}>
      {isDesktop ? (
        <Sider
          width={248}
          style={{ borderRight: '1px solid #e4e4e7', position: 'sticky', top: 0, height: '100dvh' }}
        >
          {sidebar}
        </Sider>
      ) : (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          width={264}
          styles={{ body: { padding: 0, background: NIGHT }, header: { display: 'none' } }}
        >
          {sidebar}
        </Drawer>
      )}
      <Content style={{ padding: isDesktop ? '28px 32px' : '16px', minWidth: 0 }}>
        {!isDesktop ? (
          <Button
            type="text"
            icon={<IconMenu2 size={20} />}
            onClick={() => setDrawerOpen(true)}
            style={{ marginBottom: 12 }}
          >
            Menu
          </Button>
        ) : null}
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </Content>
    </Layout>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { username, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const groups = useMemo(() => navigationFor(role), [role]);

  const items = groups.map((group, index) => ({
    type: 'group' as const,
    key: group.title ?? `group-${index}`,
    label: group.title,
    children: group.items.map((item) => ({ key: item.path, icon: item.icon, label: item.label })),
  }));
  const selected = groups
    .flatMap((g) => g.items)
    .filter((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
    )
    .map((item) => item.path);

  const signOut = async () => {
    await platformApi.logout().catch(() => undefined);
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 12px' }}>
        <img src="/favicon.svg" alt="" width={30} height={30} />
        <Typography.Text
          strong
          style={{ fontSize: 18, color: '#ffffff', fontFamily: '"Fredoka Variable", sans-serif' }}
        >
          LKDR Admin
        </Typography.Text>
      </div>
      <Menu
        mode="inline"
        theme="dark"
        items={items}
        selectedKeys={selected}
        onClick={({ key }) => {
          navigate(key);
          onNavigate();
        }}
        style={{ borderInlineEnd: 0, padding: '0 8px', flex: 1, overflowY: 'auto' }}
      />
      <UserFooter name={username} role={ROLE_LABELS[role]}>
        <Button
          type="text"
          size="small"
          icon={<IconLogout size={16} />}
          onClick={signOut}
          aria-label="Sign out"
        />
      </UserFooter>
    </div>
  );
}

function UserFooter({ name, role, children }: { name: string; role: string; children: ReactNode }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderTop: '1px solid #f0f0f2' }}
    >
      <Avatar style={{ background: '#eef2ff', color: '#3451b2' }}>{name.slice(0, 1).toUpperCase()}</Avatar>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
        <Typography.Text strong ellipsis style={{ display: 'block', color: '#ffffff' }}>
          {name}
        </Typography.Text>
        <Typography.Text style={{ fontSize: 12, color: '#b9a8ff' }}>{role}</Typography.Text>
      </div>
      {children}
    </div>
  );
}
