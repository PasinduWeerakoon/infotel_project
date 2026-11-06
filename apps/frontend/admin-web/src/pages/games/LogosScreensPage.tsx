/**
 * A4: logos. Logos are uploaded here and loaded by the screens and phones through the API, so they
 * can be changed at any time without a new release. The TV screens are fixed (Spin the Wheel,
 * Lucky Dip and the main display, set up at deploy) and their links never change.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Flex, Row, Typography } from 'antd';
import { type Logo, platformApi } from '../../api/platform';
import { ImageUpload } from '../../components/ImageUpload';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
const LOGO_HINTS: Record<string, string> = {
  spin: 'Stall screen and phones (Spin the Wheel)',
  'lucky-dip': 'Stall screen and phones (Lucky Dip)',
  event: 'Top of every screen',
  hunt: 'Treasure Hunt leaderboard screen',
};

export function LogosScreensPage() {
  return (
    <>
      <PageHeader title="Logos" description="The logos shown on the TV screens and phones" />
      <LogosTab />
    </>
  );
}

function LogosTab() {
  const logos = useQuery({ queryKey: ['logos'], queryFn: platformApi.logos });
  const save = useAction((logo: Logo) => platformApi.saveLogo(logo.logoId, logo), {
    success: 'Logo updated',
    refresh: [['logos']],
  });
  const items = (logos.data?.items ?? []).filter((l) => l.logoType === 'game' || l.logoType === 'display');

  return (
    <Row gutter={[16, 16]}>
      {items.map((logo) => (
        <Col xs={24} sm={12} xl={6} key={logo.logoId}>
          {/* Equal height cards; the footer sits on the same line in every card */}
          <Card style={{ height: '100%' }} styles={{ body: { height: '100%' } }}>
            <Flex vertical gap={12} style={{ height: '100%' }}>
              <ImageUpload
                purpose="logo"
                size={120}
                imageUrl={logo.imageUrl}
                onUploaded={(key) => save.mutate({ ...logo, imageKey: key })}
              />
              <div>
                <Typography.Text strong>{logo.name}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                  {LOGO_HINTS[logo.targetId ?? ''] ?? logo.logoType}
                </Typography.Paragraph>
              </div>
              <Flex
                vertical
                gap={4}
                style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {logo.logoType === 'game' ? 'QuickLook logo ID' : 'Shown on'}
                </Typography.Text>
                <Flex align="center" style={{ height: 24 }}>
                  {logo.logoType === 'game' ? (
                    <Typography.Text code copyable style={{ fontSize: 12 }}>
                      {logo.logoId}
                    </Typography.Text>
                  ) : (
                    <Typography.Text style={{ fontSize: 12 }}>Screens only</Typography.Text>
                  )}
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
