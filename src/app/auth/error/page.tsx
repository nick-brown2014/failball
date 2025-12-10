"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const errorMessages: Record<string, string> = {
  Configuration: "There is a problem with the server configuration.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The verification link may have expired or already been used.",
  OAuthSignin: "Error in constructing an authorization URL.",
  OAuthCallback: "Error in handling the response from the OAuth provider.",
  OAuthCreateAccount: "Could not create OAuth provider user in the database.",
  EmailCreateAccount: "Could not create email provider user in the database.",
  Callback: "Error in the OAuth callback handler route.",
  OAuthAccountNotLinked: "This email is already associated with another account.",
  EmailSignin: "The email could not be sent.",
  CredentialsSignin: "The email or password you entered is incorrect.",
  SessionRequired: "Please sign in to access this page.",
  Default: "An error occurred during authentication.",
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "Default";
  const errorMessage = errorMessages[error] || errorMessages.Default;

  return (
    <>
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p className="font-medium">Error: {error}</p>
        <p className="mt-2">{errorMessage}</p>
      </div>

      <div className="space-y-4">
        <Link
          href="/auth/signin"
          className="block w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
        >
          Try signing in again
        </Link>
        <Link
          href="/"
          className="block w-full py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Go back home
        </Link>
      </div>
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="text-center text-gray-500">
      Loading...
    </div>
  );
}

export default function AuthError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <Link href="/" className="block">
            <h1 className="text-3xl font-bold text-orange-600">Fantasy Failball</h1>
          </Link>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
            Authentication Error
          </h2>
        </div>

        <Suspense fallback={<LoadingFallback />}>
          <AuthErrorContent />
        </Suspense>
      </div>
    </div>
  );
}
