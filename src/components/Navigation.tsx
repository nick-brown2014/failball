import Link from "next/link";

export default function Navigation() {
  return (
    <nav className="bg-[var(--nav)] w-full flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 overflow-hidden">
      <Link 
        href="/" 
        className="font-bold text-xl text-foreground hover:opacity-80 transition-opacity"
      >
        Fantasy Failball
      </Link>
      
      <div className="flex items-center justify-end gap-6 pr-4">
        <Link 
          href="/rules" 
          className="text-slate-100 hover:opacity-80 transition-colors font-medium"
        >
          Rules
        </Link>
        <Link 
          href="/contact" 
          className="text-slate-100 hover:opacity-80 transition-colors font-medium"
        >
          Contact Us
        </Link>
      </div>
    </nav>
  );
}