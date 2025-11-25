import Navigation from "@/components/Navigation";
import ContactForm from "@/components/ContactForm";

export default function Contact() {
  return (
    <div className="font-sans min-h-screen w-full max-w-screen">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
          <ContactForm />
        </div>
      </main>
    </div>
  );
}