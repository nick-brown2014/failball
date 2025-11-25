export { default } from "next-auth/middleware"

export const config = {
  // Protect these routes - require authentication
  matcher: [
    "/dashboard/:path*",
    "/leagues/:path*",
    "/teams/:path*",
    "/draft/:path*",
  ],
}
