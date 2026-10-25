"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  MapPin,
  FileText,
  User,
  Phone,
  ShieldCheck,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

const LEGAL_CATEGORIES = [
  "נזיקין",
  "מקרקעין",
  "משפחה",
  "מסחרי",
  "עבודה",
] as const;

export default function NewCasePage() {
  const router = useRouter();

  const [category, setCategory] = useState<string>(LEGAL_CATEGORIES[0]);
  const [city, setCity] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [clientPhone, setClientPhone] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    if (
      !category.trim() ||
      !city.trim() ||
      !description.trim() ||
      !clientName.trim() ||
      !clientPhone.trim()
    ) {
      setErrorMsg("אנא מלא את כל שדות החובה בטופס.");
      return;
    }

    setSubmitting(true);

    try {
      // בדיקה אם קיים משתמש מחובר או פרופיל קיים עבור referrer_id
      let referrerId: string | null = null;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        referrerId = user.id;
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .limit(1);
        if (profiles && profiles.length > 0) {
          referrerId = profiles[0].id;
        }
      }

      const payload: Record<string, unknown> = {
        category,
        city: city.trim(),
        description: description.trim(),
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        status: "open",
      };

      if (referrerId) {
        payload.referrer_id = referrerId;
      }

      let { error } = await supabase.from("cases").insert([payload]);

      // אם קיימת אילוץ Foreign Key על referrer_id שלא קיים בטבלת profiles, נכניס ללא referrer_id
      if (error && referrerId) {
        const fallbackPayload = {
          category,
          city: city.trim(),
          description: description.trim(),
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          status: "open",
        };
        const retry = await supabase.from("cases").insert([fallbackPayload]);
        error = retry.error;
      }

      if (error) {
        throw new Error(`שגיאה בשמירת התיק: ${error.message}`);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1200);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "אירעה שגיאה ביצירת התיק החדש";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* קישור חזרה לפיד */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>חזרה לפיד התיקים</span>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* כותרת הטופס */}
        <div className="border-b border-slate-100 bg-slate-900 px-6 py-6 text-white sm:px-8">
          <h1 className="text-2xl font-extrabold tracking-tight">
            פתיחת תיק חדש להפניה
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            הזן את פרטי התיק. התיאור העובדתי והעיר יוצגו באופן אנונימי בפיד, בעוד
            ששם הלקוח ומספר הטלפון יישארו חסויים עד לחתימת עורך הדין המקבל על הסכם
            הפניה.
          </p>
        </div>

        {/* גוף הטופס */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <span>התיק פורסם בהצלחה בסטטוס פתוח! מעביר לפיד התיקים...</span>
            </div>
          )}

          {/* חלק 1: פרטים גלויים בפיד האנונימי */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
              פרטים גלויים בפיד האנונימי
            </h2>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* תחום משפטי */}
              <div className="space-y-1.5">
                <label
                  htmlFor="category"
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
                >
                  <Briefcase className="h-4 w-4 text-slate-500" />
                  <span>תחום משפטי</span>
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-2xs focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  {LEGAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* עיר הלקוח */}
              <div className="space-y-1.5">
                <label
                  htmlFor="city"
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
                >
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span>עיר הלקוח</span>
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="לדוגמה: תל אביב, חיפה, ירושלים..."
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            {/* תיאור עובדתי אנונימי */}
            <div className="space-y-1.5">
              <label
                htmlFor="description"
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
              >
                <FileText className="h-4 w-4 text-slate-500" />
                <span>תיאור עובדתי אנונימי</span>
              </label>
              <textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תאר את נסיבות המקרה והסעד המבוקש ללא ציון שמות או פרטים מזהים של הלקוח..."
                required
                className="w-full rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>

          {/* חלק 2: פרטי לקוח חסויים (נחשפים רק לאחר חתימה) */}
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-900">
              <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <h2 className="text-sm font-bold">
                  פרטי הלקוח החסויים (מוגנים מאחורי שער חתימה)
                </h2>
                <p className="text-xs text-amber-800/80">
                  פרטים אלו יישמרו באופן מאובטח וייחשפו אך ורק לעורך הדין שיתפוס את
                  התיק ויחתום דיגיטלית על הסכם ההפניה.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* שם מלא של הלקוח */}
              <div className="space-y-1.5">
                <label
                  htmlFor="clientName"
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
                >
                  <User className="h-4 w-4 text-slate-500" />
                  <span>שם מלא של הלקוח</span>
                </label>
                <input
                  id="clientName"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="ישראל ישראלי"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              {/* טלפון הלקוח */}
              <div className="space-y-1.5">
                <label
                  htmlFor="clientPhone"
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"
                >
                  <Phone className="h-4 w-4 text-slate-500" />
                  <span>טלפון הלקוח</span>
                </label>
                <input
                  id="clientPhone"
                  type="tel"
                  dir="ltr"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="050-0000000"
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 text-right shadow-2xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>
          </div>

          {/* כפתור שמירה */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Link
              href="/"
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ביטול
            </Link>

            <button
              type="submit"
              disabled={submitting || success}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>שומר ומפרסם תיק...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-amber-400" />
                  <span>שמור ופרסם תיק בפיד</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
