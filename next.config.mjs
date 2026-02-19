function createSecurityHeaders({ isDevelopment = process.env.NODE_ENV === 'development' } = {}) {
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    'https://maps.googleapis.com',
    'https://maps.gstatic.com',
    'https://cdnjs.buymeacoffee.com'
  ];

  return [
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        `script-src ${scriptSources.join(' ')}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https: wss:",
        "frame-src 'self' https:"
      ].join('; ')
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
  ];
}

/** @type {import('next').NextConfig} */
const SECURITY_HEADERS = createSecurityHeaders();

const nextConfig = {
  serverExternalPackages: ['node-ical'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS
      }
    ];
  }
};

export default nextConfig;
export { createSecurityHeaders };
