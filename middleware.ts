import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect
} from '@convex-dev/auth/nextjs/server';

const isSignInRoute = createRouteMatcher(['/signin']);
const isProtectedRoute = createRouteMatcher([
  '/map(.*)',
  '/calendar(.*)',
  '/planning(.*)',
  '/spots(.*)',
  '/config(.*)',
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();

  if (isSignInRoute(request) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, '/planning');
  }

  if (isProtectedRoute(request) && !isAuthenticated) {
    return nextjsMiddlewareRedirect(request, '/signin');
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)']
};
