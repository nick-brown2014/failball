import { SignUp } from '@clerk/nextjs';

export default function AuthForm() {
  return (
    <div className="w-full max-w-md mx-auto">
      <SignUp />
    </div>
  );
}