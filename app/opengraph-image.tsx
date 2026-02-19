import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const alt = 'SF Travel Planner — See events, spots, and safety on one map';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  const fontsDir = join(process.cwd(), 'public', 'fonts');
  const [spaceGroteskBold, jetbrainsMono, mapBuffer] = await Promise.all([
    readFile(join(fontsDir, 'SpaceGrotesk-Bold.ttf')),
    readFile(join(fontsDir, 'JetBrainsMono-Medium.ttf')),
    readFile(join(process.cwd(), 'public', 'screenshots', 'map.png')),
  ]);

  const mapSrc = `data:image/png;base64,${mapBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0C0C0C',
          padding: '48px',
          gap: '48px',
        }}
      >
        {/* Left — text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            gap: '0px',
          }}
        >
          {/* Green accent bar */}
          <div style={{ display: 'flex', width: '48px', height: '4px', backgroundColor: '#00FF88', marginBottom: '32px' }} />

          <div
            style={{
              display: 'flex',
              fontSize: '52px',
              fontFamily: 'Space Grotesk',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1.1,
              letterSpacing: '-1px',
            }}
          >
            SF Travel Planner
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: '18px',
              fontFamily: 'JetBrains Mono',
              fontWeight: 500,
              color: '#8a8a8a',
              marginTop: '16px',
              letterSpacing: '0.5px',
            }}
          >
            by Ian Hsiao
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: '16px',
              fontFamily: 'JetBrains Mono',
              fontWeight: 500,
              color: '#00FF88',
              marginTop: '8px',
              letterSpacing: '0.5px',
            }}
          >
            sf.ianhsiao.me
          </div>

          {/* Tagline */}
          <div
            style={{
              display: 'flex',
              fontSize: '14px',
              fontFamily: 'JetBrains Mono',
              fontWeight: 500,
              color: '#6a6a6a',
              marginTop: '24px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {'// EVENTS · SPOTS · SAFETY · ONE MAP'}
          </div>
        </div>

        {/* Right — map screenshot */}
        <div
          style={{
            display: 'flex',
            width: '534px',
            height: '534px',
            border: '1px solid #2f2f2f',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <img
            src={mapSrc}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Space Grotesk', data: spaceGroteskBold, style: 'normal', weight: 700 },
        { name: 'JetBrains Mono', data: jetbrainsMono, style: 'normal', weight: 500 },
      ],
    },
  );
}
