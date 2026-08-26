import { Resend } from "resend";

const FROM = "Failball <onboarding@resend.dev>";
let warnedAboutMissingKey = false;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedAboutMissingKey) {
      console.warn(
        "RESEND_API_KEY is not configured; email notifications are disabled",
      );
      warnedAboutMissingKey = true;
    }
    return false;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM,
    ...message,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export function getAppUrl(request?: Pick<Request, "headers">): string {
  const origin = request?.headers.get("origin");
  const host = request?.headers.get("host");
  const protocol = request?.headers.get("x-forwarded-proto") ?? "https";
  const derivedUrl = origin ?? (host ? `${protocol}://${host}` : undefined);

  return (
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    derivedUrl ??
    "http://localhost:3000"
  );
}
