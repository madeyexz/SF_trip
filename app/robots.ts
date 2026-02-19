import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const protectedPaths = ['/api/', '/app/', '/planning', '/map', '/calendar', '/spots', '/config'];

  return {
    rules: [
      // Default: allow public pages, block protected routes
      {
        userAgent: '*',
        allow: '/',
        disallow: protectedPaths,
      },
      // Explicitly allow AI search engine bots for GEO
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: protectedPaths,
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: protectedPaths,
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: protectedPaths,
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: protectedPaths,
      },
      {
        userAgent: 'anthropic-ai',
        allow: '/',
        disallow: protectedPaths,
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: protectedPaths,
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: protectedPaths,
      },
    ],
    sitemap: 'https://sf.ianhsiao.me/sitemap.xml',
  };
}
