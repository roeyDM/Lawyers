"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Headphones,
  User,
  Phone,
  MapPin,
  Briefcase,
  FileText,
  MessageSquareText,
  PlusCircle,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ExternalLink,
  Clock,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import { supabase, LegalCase } from "@/lib/supabase/client";

const LEGAL_CATEGORIES = [
  "נזיקין",
  "מקרקעין",
  "משפחה",
  "מסחרי",
  "עבודה",
] as const;

const STATUS_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  open: {
    label: "פתוח בפיד",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  locked: {
    label: "נעול לחתימה",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  assigned: {
    label: "הוקצה לעו״ד",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

export default function AdminDirectLeadsPage() {
  // שדות טופס קליטת ליד מהיר
  const [clientName, setClientName] = useState<string>("");
  const [clientPhone, setClientPhone] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [category, setCategory] = useState<string>(LEGAL_CATEGORIES[0]);
  const [description, setDescription] = useState<string>("");
  const [callNotes, setCallNotes] = useState<string>("");

  // מצבי טופס וטבלה
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loadingLeads, setLoadingLeads] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [leads, setLeads] = useState<LegalCase[]>([]);
  const [localCallNotes, setLocalCallNotes] = useState<Record<string, string>>(
    {}
  );
  const [onlyDirectLeads, setOnlyDirectLeads] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem("lexconnect_call_notes");
      if (savedNotes) {
        setLocalCallNotes(JSON.parse(savedNotes));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const saveLocalNote = (caseId: string, note: string) => {
    if (!note.trim()) return;
    setLocalCallNotes((prev) => {
      const updated = { ...prev, [caseId]: note.trim() };
      try {
        localStorage.setItem("lexconnect_call_notes", JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        throw error;
      }

      setLeads((data as LegalCase[]) || []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "שגיאה בטעינת הלידים מ-Supabase";
      setErrorMsg(message);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCreateLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (
      !clientName.trim() ||
      !clientPhone.trim() ||
      !city.trim() ||
      !category.trim() ||
      !description.trim()
    ) {
      setErrorMsg("אנא מלא את כל שדות החובה של הליד.");
      return;
    }

    setSubmitting(true);

    try {
      const fullPayload: Record<string, unknown> = {
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        city: city.trim(),
        category,
        description: description.trim(),
        call_notes: callNotes.trim() || null,
        is_direct_lead: true,
        status: "open",
      };

      let { data: insertedData, error: insertError } = await supabase
        .from("cases")
        .insert([fullPayload])
        .select()
        .single();

      // גיבוי 1: אם עמודת call_notes עדיין לא הוגדרה במסד הנתונים, נשמור עם is_direct_lead = true
      if (insertError) {
        const withoutCallNotesPayload: Record<string, unknown> = {
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          city: city.trim(),
          category,
          description: description.trim(),
          is_direct_lead: true,
          status: "open",
        };

        const retry1 = await supabase
          .from("cases")
          .insert([withoutCallNotesPayload])
          .select()
          .single();

        insertedData = retry1.data;
        insertError = retry1.error;
      }

      // גיבוי 2: אם גם עמודת is_direct_lead טרם נוספה ב-DB, נשמור עם השדות הבסיסיים כדי שלא תיכשל ההזנה
      if (insertError) {
        const basePayload: Record<string, unknown> = {
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          city: city.trim(),
          category,
          description: description.trim(),
          status: "open",
        };

        const retry2 = await supabase
          .from("cases")
          .insert([basePayload])
          .select()
          .single();

        insertedData = retry2.data;
        insertError = retry2.error;
      }

      if (insertError) {
        throw new Error(`שגיאה בשמירת הליד: ${insertError.message}`);
      }

      if (insertedData) {
        const newLead: LegalCase = {
          ...(insertedData as LegalCase),
          is_direct_lead: true,
          call_notes:
            (insertedData as LegalCase).call_notes || callNotes.trim() || null,
        };

        if (callNotes.trim()) {
          saveLocalNote(newLead.id, callNotes.trim());
        }

        setLeads((prev) => [newLead, ...prev]);
      } else {
        await fetchLeads();
      }

      // איפוס הטופס להזנה מהירה של הליד הבא
      setClientName("");
      setClientPhone("");
      setCity("");
      setCategory(LEGAL_CATEGORIES[0]);
      setDescription("");
      setCallNotes("");
      setSuccessMsg("הליד נקלט בהצלחה ופורסם בפיד בסטטוס פתוח!");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "אירעה שגיאה בשמירת הליד";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  // סינון הלידים בטבלה
  const filteredLeads = leads.filter((item) => {
    if (onlyDirectLeads) {
      // אם העמודה is_direct_lead קיימת בבסיס הנתונים נסנן לפיה, ואם לא הוגדרה עדיין נציג הכל
      const hasDirectLeadColumn = leads.some(
        (l) => typeof l.is_direct_lead === "boolean"
      );
      if (hasDirectLeadColumn && !item.is_direct_lead) {
        return false;
      }
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      item.client_name?.toLowerCase().includes(q) ||
      item.client_phone?.toLowerCase().includes(q) ||
      item.city?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      (item.call_notes || localCallNotes[item.id] || "")
        .toLowerCase()
        .includes(q)
    );
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "היום";
    try {
      return new Intl.DateTimeFormat("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(dateStr));
    } catch {
      return "היום";
    }
  };

  const totalLeadsCount = filteredLeads.length;
  const openCount = filteredLeads.filter((l) => l.status === "open").length;
  const lockedCount = filteredLeads.filter((l) => l.status === "locked").length;
  const assignedCount = filteredLeads.filter(
    (l) => l.status === "assigned"
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* כותרת עמוד קליטת לידים ישירים */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-slate-900 p-6 sm:p-8 text-white shadow-md sm:flex-row sm:items-center">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
            <Headphones className="h-3.5 w-3.5" />
            <span>מוקד קליטת לידים ישירים • נועה ואלעד</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            ממשק קליטת לידים ומעקב הקצאות
          </h1>
          <p className="max-w-2xl text-sm text-slate-300 leading-relaxed">
            הזנה מהירה של לידים נכנסים ישירות לפיד התיקים עם סימון{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">
              is_direct_lead = true
            </code>{" "}
            ומעקב מלא אחר תפיסת התיק והסכמי שכר הטרחה.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLeads}
          disabled={loadingLeads}
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw
            className={`h-4 w-4 ${loadingLeads ? "animate-spin" : ""}`}
          />
          <span>רענן נתונים</span>
        </button>
      </div>

      {/* כרטיסי מדדים מהירים */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>סה״כ לידים בתצוגה</span>
            <FolderOpen className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            {totalLeadsCount}
          </p>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-sky-800 text-xs font-semibold">
            <span>פתוחים בפיד</span>
            <PlusCircle className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-sky-900">
            {openCount}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 text-xs font-semibold">
            <span>נעולים כעת לחתימה</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-amber-900">
            {lockedCount}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
            <span>הוקצו לעו״ד</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-900">
            {assignedCount}
          </p>
        </div>
      </div>

      {/* פריסה דו-עמודתית: טופס הזנה מהיר + טבלת מעקב לידים */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* טופס מהיר להזנת ליד (4 עמודות) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <PlusCircle className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-bold">הזנת ליד ישיר חדש</h2>
            </div>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              סטטוס: open
            </span>
          </div>

          <form onSubmit={handleCreateLead} className="p-6 space-y-4">
            {errorMsg && (
              <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* שם לקוח */}
              <div className="space-y-1.5">
                <label
                  htmlFor="lead-client-name"
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
                >
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>שם לקוח *</span>
                </label>
                <input
                  id="lead-client-name"
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="שם מלא של הפונה"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              {/* טלפון */}
              <div className="space-y-1.5">
                <label
                  htmlFor="lead-client-phone"
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
                >
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>טלפון *</span>
                </label>
                <input
                  id="lead-client-phone"
                  type="tel"
                  dir="ltr"
                  required
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="050-0000000"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 text-right placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* עיר */}
              <div className="space-y-1.5">
                <label
                  htmlFor="lead-city"
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
                >
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>עיר *</span>
                </label>
                <input
                  id="lead-city"
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="לדוגמה: ראשון לציון"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              {/* תחום משפטי */}
              <div className="space-y-1.5">
                <label
                  htmlFor="lead-category"
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
                >
                  <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                  <span>תחום משפטי *</span>
                </label>
                <select
                  id="lead-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  {LEGAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* תקציר מקרה (אנונימי לפיד) */}
            <div className="space-y-1.5">
              <label
                htmlFor="lead-description"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
              >
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span>תקציר מקרה (מוצג בפיד האנונימי) *</span>
              </label>
              <textarea
                id="lead-description"
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תיאור תמציתי של המקרה המשפטי ללא פרטים מזהים..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            {/* הערות שיחה */}
            <div className="space-y-1.5">
              <label
                htmlFor="lead-call-notes"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700"
              >
                <MessageSquareText className="h-3.5 w-3.5 text-amber-600" />
                <span>הערות שיחה (תיעוד מוקד נועה ואלעד)</span>
              </label>
              <textarea
                id="lead-call-notes"
                rows={2}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="רמת דחיפות, שעות נוחות לחזרה, מסמכים שבידי הלקוח..."
                className="w-full rounded-xl border border-amber-200 bg-amber-50/30 p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/10"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>שומר ליד ומפרסם בפיד...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4 text-amber-400" />
                  <span>שמור ליד ישיר ופרסם בפיד</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* טבלת לידים קיימים למעקב (7 עמודות) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                טבלת לידים קיימים למעקב
              </h2>
              <p className="text-xs text-slate-500">
                מעקב בזמן אמת אחר סטטוס הלידים, פרטי הפונים והסכמים חתומים
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חיפוש לפי שם, טלפון, עיר..."
                  className="w-48 rounded-xl border border-slate-200 bg-slate-50 pr-8 pl-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlyDirectLeads((prev) => !prev)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  onlyDirectLeads
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {onlyDirectLeads ? "לידים ישירים בלבד" : "כל התיקים במערכת"}
              </button>
            </div>
          </div>

          {loadingLeads ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-14 w-full animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-bold text-slate-800">
                לא נמצאו לידים להצגה
              </p>
              <p className="text-xs text-slate-500">
                הזן ליד חדש בטופס מימין כדי לראות אותו מופיע בטבלת המעקב.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-4 py-3.5">לקוח וטלפון</th>
                    <th className="px-4 py-3.5">תחום ועיר</th>
                    <th className="px-4 py-3.5">תקציר והערות שיחה</th>
                    <th className="px-4 py-3.5">סטטוס</th>
                    <th className="px-4 py-3.5">הסכמים</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => {
                    const statusBadge = STATUS_BADGES[lead.status] || {
                      label: lead.status,
                      className: "bg-slate-100 text-slate-700 border-slate-200",
                    };
                    const noteText =
                      lead.call_notes || localCallNotes[lead.id] || null;

                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-slate-50/80 transition-colors align-top"
                      >
                        {/* לקוח וטלפון */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {lead.client_name}
                          </div>
                          <a
                            href={`tel:${lead.client_phone}`}
                            dir="ltr"
                            className="inline-block text-xs font-semibold text-emerald-700 hover:underline mt-0.5"
                          >
                            {lead.client_phone}
                          </a>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {formatDate(lead.created_at)}
                          </div>
                        </td>

                        {/* תחום ועיר */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                            {lead.category}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-slate-600 mt-1">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            <span>{lead.city}</span>
                          </div>
                        </td>

                        {/* תקציר והערות שיחה */}
                        <td className="px-4 py-3.5 max-w-xs">
                          <p className="text-xs text-slate-800 line-clamp-2 leading-relaxed">
                            {lead.description}
                          </p>
                          {noteText && (
                            <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-[11px] text-amber-900">
                              <span className="font-bold">הערת שיחה: </span>
                              <span>{noteText}</span>
                            </div>
                          )}
                        </td>

                        {/* סטטוס */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        </td>

                        {/* הסכמים */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs space-y-1">
                          {lead.signed_agreement_url ? (
                            <a
                              href={lead.signed_agreement_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 underline"
                            >
                              <span>הסכם הפניה</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="block text-slate-400">
                              ללא חתימה
                            </span>
                          )}

                          {lead.fee_contract_url && (
                            <a
                              href={lead.fee_contract_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 underline"
                            >
                              <span>הסכם שכ״ט</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
