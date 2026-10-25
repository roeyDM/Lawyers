"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MapPin,
  Calendar,
  Briefcase,
  Lock,
  Clock,
  FileSignature,
  User,
  Phone,
  Upload,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  FileCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { supabase, LegalCase } from "@/lib/supabase/client";
import SignatureModal from "@/components/SignatureModal";

const CATEGORIES = ["הכל", "נזיקין", "מקרקעין", "משפחה", "מסחרי", "עבודה"];

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  נזיקין: "bg-rose-50 text-rose-700 border-rose-200",
  מקרקעין: "bg-amber-50 text-amber-800 border-amber-200",
  משפחה: "bg-purple-50 text-purple-700 border-purple-200",
  מסחרי: "bg-blue-50 text-blue-700 border-blue-200",
  עבודה: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function LockCountdown({ lockedAt }: { lockedAt: string | null }) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);

  useEffect(() => {
    const startMs = lockedAt ? new Date(lockedAt).getTime() : Date.now();
    const expiryMs = startMs + 15 * 60 * 1000;

    const tick = () => {
      const diff = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockedAt]);

  const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const secs = String(remainingSeconds % 60).padStart(2, "0");

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
      <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
      <span>נעול עבורך: {mins}:{secs} דק׳</span>
    </div>
  );
}

export default function CasesFeedPage() {
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("הכל");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mySessionCaseIds, setMySessionCaseIds] = useState<string[]>([]);
  const [lockingCaseId, setLockingCaseId] = useState<string | null>(null);
  const [activeModalCase, setActiveModalCase] = useState<LegalCase | null>(null);
  const [uploadingCaseId, setUploadingCaseId] = useState<string | null>(null);

  // אתחול מזהה משתמש (מ-Supabase Auth או מפרופיל קיים/מזהה מקומי ל-MVP)
  useEffect(() => {
    async function initUser() {
      try {
        const storedCaseIds = localStorage.getItem("lexconnect_my_cases");
        if (storedCaseIds) {
          setMySessionCaseIds(JSON.parse(storedCaseIds));
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.id) {
          setCurrentUserId(user.id);
          return;
        }

        // אם אין משתמש מחובר ב-Auth, נבדוק אם קיים פרופיל בטבלת profiles עבור ה-MVP
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .limit(1);

        if (profiles && profiles.length > 0) {
          setCurrentUserId(profiles[0].id);
          return;
        }

        // גיבוי: מזהה UUID עקבי בדפדפן
        let localId = localStorage.getItem("lexconnect_user_id");
        if (!localId) {
          localId = crypto.randomUUID();
          localStorage.setItem("lexconnect_user_id", localId);
        }
        setCurrentUserId(localId);
      } catch {
        // במקרה שאין חיבור או שגיאה, נמשיך ללא חסימה
      }
    }

    initUser();
  }, []);

  const rememberMyCase = (caseId: string) => {
    setMySessionCaseIds((prev) => {
      if (prev.includes(caseId)) return prev;
      const updated = [...prev, caseId];
      try {
        localStorage.setItem("lexconnect_my_cases", JSON.stringify(updated));
      } catch {
        // ignore storage error
      }
      return updated;
    });
  };

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        throw error;
      }

      setCases((data as LegalCase[]) || []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "שגיאה בטעינת התיקים מ-Supabase";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // סינון תיקים: רק איפה ש-status = 'open' או שהתיק נעול/הוקצה למשתמש הנוכחי
  const visibleCases = cases.filter((c) => {
    const isMine =
      (currentUserId &&
        (c.locked_by === currentUserId || c.assigned_to === currentUserId)) ||
      mySessionCaseIds.includes(c.id);

    const statusAllowed =
      c.status === "open" ||
      (c.status === "locked" && isMine) ||
      (c.status === "assigned" && isMine);

    if (!statusAllowed) return false;

    if (selectedCategory !== "הכל" && c.category !== selectedCategory) {
      return false;
    }

    return true;
  });

  // לחיצה על "תפוס תיק"
  const handleGrabCase = async (caseItem: LegalCase) => {
    setErrorMsg(null);
    setLockingCaseId(caseItem.id);

    const nowIso = new Date().toISOString();

    try {
      const updatePayload: Partial<LegalCase> = {
        status: "locked",
        locked_at: nowIso,
      };
      if (currentUserId) {
        updatePayload.locked_by = currentUserId;
      }

      let { data: updatedData, error: updateError } = await supabase
        .from("cases")
        .update(updatePayload)
        .eq("id", caseItem.id)
        .select()
        .single();

      // אם קיימת מגבלת Foreign Key על locked_by מול טבלת profiles, נעדכן עם locked_by: null ונשמור שיוך מקומי
      if (updateError && currentUserId) {
        const retry = await supabase
          .from("cases")
          .update({
            status: "locked",
            locked_at: nowIso,
          })
          .eq("id", caseItem.id)
          .select()
          .single();

        updatedData = retry.data;
        updateError = retry.error;
      }

      if (updateError) {
        throw new Error(`לא ניתן לנעול את התיק: ${updateError.message}`);
      }

      const lockedCase: LegalCase = updatedData || {
        ...caseItem,
        status: "locked",
        locked_by: currentUserId,
        locked_at: nowIso,
      };

      rememberMyCase(caseItem.id);

      setCases((prev) =>
        prev.map((item) => (item.id === lockedCase.id ? lockedCase : item))
      );

      // פתיחת מודל החתימה על "הסכם הפניה והמחאת זכות"
      setActiveModalCase(lockedCase);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "אירעה שגיאה בתפיסת התיק";
      setErrorMsg(message);
    } finally {
      setLockingCaseId(null);
    }
  };

  const handleCaseUpdatedFromModal = (updatedCase: LegalCase) => {
    rememberMyCase(updatedCase.id);
    setCases((prev) =>
      prev.map((item) => (item.id === updatedCase.id ? updatedCase : item))
    );
    setActiveModalCase(updatedCase);
  };

  const handleCardFeeContractUpload = async (
    caseItem: LegalCase,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setUploadingCaseId(caseItem.id);

    try {
      const safeExt = file.name.split(".").pop() || "pdf";
      const filePath = `fee-contracts/fee-contract-${caseItem.id}-${Date.now()}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from("agreements")
        .upload(filePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(
          `שגיאה בהעלאת הסכם שכר הטרחה: ${uploadError.message}`
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from("agreements")
        .getPublicUrl(filePath);

      const contractUrl = publicUrlData.publicUrl;

      const { data: updatedData, error: updateError } = await supabase
        .from("cases")
        .update({ fee_contract_url: contractUrl })
        .eq("id", caseItem.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(
          `שגיאה בעדכון קישור הסכם שכר הטרחה: ${updateError.message}`
        );
      }

      const finalCase: LegalCase = updatedData || {
        ...caseItem,
        fee_contract_url: contractUrl,
      };

      setCases((prev) =>
        prev.map((item) => (item.id === finalCase.id ? finalCase : item))
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "אירעה שגיאה בהעלאת הסכם שכר הטרחה";
      setErrorMsg(message);
    } finally {
      setUploadingCaseId(null);
    }
  };

  const formatOpeningDate = (dateStr?: string) => {
    if (!dateStr) return "היום";
    try {
      return new Intl.DateTimeFormat("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(dateStr));
    } catch {
      return "היום";
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* כותרת עליונה (Hero) */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl bg-slate-900 p-6 sm:p-8 text-white shadow-md sm:flex-row sm:items-center">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
            <span>זירת שיתופי פעולה משפטית</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            פיד תיקים אנונימיים להפניה
          </h1>
          <p className="max-w-2xl text-sm text-slate-300 leading-relaxed">
            צפה בתיקים פנויים שהועלו על ידי עמיתים למקצוע. תפיסת תיק נועלת אותו
            עבורך ל-15 דקות לצורך חתימה דיגיטלית על הסכם הפניה וחשיפת פרטי הלקוח.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={fetchCases}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            <span>רענן</span>
          </button>

          <Link
            href="/new-case"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-400 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>פתיחת תיק חדש</span>
          </Link>
        </div>
      </div>

      {/* סרגל סינון לפי תחום משפטי */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((category) => {
            const active = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="text-xs font-medium text-slate-500">
          מציג {visibleCases.length} תיקים זמינים
        </div>
      </div>

      {/* הודעת שגיאה אם קיימת */}
      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* מצב טעינה */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
            >
              <div className="flex justify-between">
                <div className="h-6 w-20 rounded-lg bg-slate-200" />
                <div className="h-5 w-24 rounded-lg bg-slate-100" />
              </div>
              <div className="h-4 w-32 rounded bg-slate-100" />
              <div className="space-y-2 pt-2">
                <div className="h-3.5 w-full rounded bg-slate-100" />
                <div className="h-3.5 w-5/6 rounded bg-slate-100" />
                <div className="h-3.5 w-2/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleCases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Briefcase className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">
              אין כרגע תיקים פתוחים להצגה
            </h3>
            <p className="text-sm text-slate-500">
              ניתן לפתוח תיק חדש להפניה ולהציג אותו בפיד האנונימי.
            </p>
          </div>
          <div>
            <Link
              href="/new-case"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              <span>פרסם תיק ראשון</span>
            </Link>
          </div>
        </div>
      ) : (
        /* רשימת כרטיסי התיקים */
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visibleCases.map((caseItem) => {
            const isLockedByMe = caseItem.status === "locked";
            const isAssignedToMe = caseItem.status === "assigned";
            const badgeStyle =
              CATEGORY_BADGE_STYLES[caseItem.category] ||
              "bg-slate-100 text-slate-800 border-slate-200";

            return (
              <div
                key={caseItem.id}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-xs transition-all hover:shadow-md ${
                  isAssignedToMe
                    ? "border-emerald-300 ring-1 ring-emerald-200"
                    : isLockedByMe
                    ? "border-amber-300 ring-1 ring-amber-200"
                    : "border-slate-200"
                }`}
              >
                <div className="space-y-4">
                  {/* שורת כותרת: תחום משפטי ותאריך פתיחה */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold ${badgeStyle}`}
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>{caseItem.category}</span>
                    </span>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>נפתח: {formatOpeningDate(caseItem.created_at)}</span>
                    </div>
                  </div>

                  {/* עיר הלקוח */}
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span>עיר: {caseItem.city}</span>
                  </div>

                  {/* תקציר המקרה האנונימי */}
                  <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line line-clamp-4">
                      {caseItem.description}
                    </p>
                  </div>

                  {/* מצב 1: תיק נעול ע"י המשתמש הנוכחי - הצגת טיימר 15 דקות */}
                  {isLockedByMe && (
                    <div className="pt-1">
                      <LockCountdown lockedAt={caseItem.locked_at} />
                    </div>
                  )}

                  {/* מצב 2: התיק נחתם והוקצה למשתמש הנוכחי - חשיפת פרטי הלקוח המלאים */}
                  {isAssignedToMe && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>פרטי הלקוח נחשפו</span>
                        </span>
                        {caseItem.signed_agreement_url && (
                          <a
                            href={caseItem.signed_agreement_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                          >
                            <span>הסכם הפניה</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2 text-slate-900">
                          <User className="h-4 w-4 text-slate-500" />
                          <span className="text-slate-600">שם הלקוח:</span>
                          <span className="font-bold">
                            {caseItem.client_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-900">
                          <Phone className="h-4 w-4 text-emerald-600" />
                          <span className="text-slate-600">טלפון:</span>
                          <a
                            href={`tel:${caseItem.client_phone}`}
                            className="font-bold text-emerald-700 hover:underline"
                            dir="ltr"
                          >
                            {caseItem.client_phone}
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* כפתור תחתון בהתאם לסטטוס התיק */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  {caseItem.status === "open" && (
                    <button
                      type="button"
                      onClick={() => handleGrabCase(caseItem)}
                      disabled={lockingCaseId === caseItem.id}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xs transition-all hover:bg-slate-800 disabled:opacity-60"
                    >
                      {lockingCaseId === caseItem.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>נועל תיק...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4 text-amber-400" />
                          <span>תפוס תיק</span>
                        </>
                      )}
                    </button>
                  )}

                  {isLockedByMe && (
                    <button
                      type="button"
                      onClick={() => setActiveModalCase(caseItem)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-xs transition-all hover:bg-amber-400"
                    >
                      <FileSignature className="h-4 w-4" />
                      <span>חתום על הסכם הפניה וחשוף פרטים</span>
                    </button>
                  )}

                  {isAssignedToMe && (
                    <div className="space-y-2">
                      {caseItem.fee_contract_url ? (
                        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                          <span className="inline-flex items-center gap-1.5">
                            <FileCheck className="h-4 w-4 text-emerald-600" />
                            <span>הסכם שכ״ט הועלה</span>
                          </span>
                          <a
                            href={caseItem.fee_contract_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 underline"
                          >
                            <span>צפה</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100">
                          {uploadingCaseId === caseItem.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>מעלה הסכם שכ״ט...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 text-amber-600" />
                              <span>העלאת עותק מהסכם שכר הטרחה החתום</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            onChange={(e) =>
                              handleCardFeeContractUpload(caseItem, e)
                            }
                            disabled={uploadingCaseId === caseItem.id}
                            className="hidden"
                          />
                        </label>
                      )}

                      <button
                        type="button"
                        onClick={() => setActiveModalCase(caseItem)}
                        className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-900 underline pt-1"
                      >
                        פתח חלון פרטי תיק מלאים
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* חלון מודל לחתימה על הסכם הפניה והמחאת זכות + שער חשיפת פרטי לקוח */}
      {activeModalCase && (
        <SignatureModal
          caseItem={activeModalCase}
          currentUserId={currentUserId}
          onClose={() => setActiveModalCase(null)}
          onCaseUpdated={handleCaseUpdatedFromModal}
        />
      )}
    </div>
  );
}
