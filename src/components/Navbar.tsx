"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, Briefcase, PlusCircle } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-xs">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* לוגו המיזם */}
        <Link
          href="/"
          className="flex items-center gap-3 text-slate-900 transition-opacity hover:opacity-90"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-amber-400 shadow-xs">
            <Scale className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-slate-900 leading-none">
              LexConnect
            </span>
            <span className="text-xs text-slate-500 mt-0.5">
              זירת הפניית תיקים לעורכי דין
            </span>
          </div>
        </Link>

        {/* קישורי ניווט */}
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              pathname === "/"
                ? "bg-slate-100 text-slate-900 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            <span>פיד תיקים</span>
          </Link>

          <Link
            href="/new-case"
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all shadow-xs ${
              pathname === "/new-case"
                ? "bg-amber-600 text-white"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            <span>פתיחת תיק חדש</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
