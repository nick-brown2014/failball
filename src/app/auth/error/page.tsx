export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md">
        <h1 className="text-2xl font-bold mb-4">Authentication Error</h1>
        <p className="text-sm text-red-600 mb-4">
          {params?.error ?? "Something went wrong with authentication."}
        </p>
        <a
          href="/auth/signin"
          className="text-blue-600 hover:underline text-sm"
        >
          Try signing in again
        </a>
      </div>
    </div>
  );
}
