"use client";

import React, { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  X,
  Clock,
  FileSignature,
  RotateCcw,
  CheckCircle2,
  User,
  Phone,
  Upload,
  FileCheck,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { supabase, LegalCase } from "@/lib/supabase/client";

interface SignatureModalProps {
  caseItem: LegalCase;
  currentUserId: string | null;
  onClose: () => void;
  onCaseUpdated: (updatedCase: LegalCase) => void;
}

function dataURLToBlob(dataURL: string): Blob {
  const parts = dataURL.split(";base64,");
  const contentType = parts[0].split(":")[1] || "image/png";
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

export default function SignatureModal({
  caseItem,
  currentUserId,
  onClose,
  onCaseUpdated,
}: SignatureModalProps) {
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);

  const [isSigned, setIsSigned] = useState<boolean>(
    caseItem.status === "assigned"
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingContract, setUploadingContract] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);
  const [feeContractUrl, setFeeContractUrl] = useState<string | null>(
    caseItem.fee_contract_url
  );
  const [signedAgreementUrl, setSignedAgreementUrl] = useState<string | null>(
    caseItem.signed_agreement_url
  );

  // חישוב טיימר ספירה לאחור של 15 דקות מרגע הנעילה
  useEffect(() => {
    if (isSigned) return;

    const lockedAtTime = caseItem.locked_at
      ? new Date(caseItem.locked_at).getTime()
      : Date.now();
    const expiryTime = lockedAtTime + 15 * 60 * 1000;

    const updateTimer = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setRemainingSeconds(diffSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [caseItem.locked_at, isSigned]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleClearSignature = () => {
    sigCanvasRef.current?.clear();
    setErrorMsg(null);
  };

  const handleSignAndApprove = async () => {
    setErrorMsg(null);

    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setErrorMsg("אנא חתום בתיבת החתימה לפני האישור.");
      return;
    }

    if (remainingSeconds <= 0) {
      setErrorMsg("זמן נעילת התיק (15 דקות) פג. אנא רענן ונסה שנית.");
      return;
    }

    setSubmitting(true);

    try {
      // 1. הפיכת החתימה לקובץ PNG
      const dataUrl = sigCanvasRef.current.toDataURL("image/png");
      const signatureBlob = dataURLToBlob(dataUrl);
      const fileName = `signatures/referral-agreement-${caseItem.id}-${Date.now()}.png`;

      // 2. שמירת הקובץ בבאקט agreements ב-Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("agreements")
        .upload(fileName, signatureBlob, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`שגיאה בהעלאת החתימה לאחסון: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from("agreements")
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;

      // 3. עדכון התיק לסטטוס assigned ושמירת ה-URL של ההסכם החתום
      const updatePayload: Partial<LegalCase> = {
        status: "assigned",
        signed_agreement_url: publicUrl,
      };

      if (currentUserId) {
        updatePayload.assigned_to = currentUserId;
      }

      let { data: updatedData, error: updateError } = await supabase
        .from("cases")
        .update(updatePayload)
        .eq("id", caseItem.id)
        .select()
        .single();

      // אם קיימת מגבלת מפתח זר על assigned_to עבור משתמש דמו שאינו בטבלת profiles, נעדכן ללא assigned_to
      if (updateError && currentUserId) {
        const retryResult = await supabase
          .from("cases")
          .update({
            status: "assigned",
            signed_agreement_url: publicUrl,
          })
          .eq("id", caseItem.id)
          .select()
          .single();
        updatedData = retryResult.data;
        updateError = retryResult.error;
      }

      if (updateError) {
        throw new Error(`שגיאה בעדכון סטטוס התיק: ${updateError.message}`);
      }

      const finalCase: LegalCase = updatedData || {
        ...caseItem,
        status: "assigned",
        assigned_to: currentUserId,
        signed_agreement_url: publicUrl,
      };

      setSignedAgreementUrl(publicUrl);
      setIsSigned(true);
      onCaseUpdated(finalCase);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "אירעה שגיאה בשמירת החתימה";
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadFeeContract = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setUploadingContract(true);

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
          `שגיאה בשמירת קישור הסכם שכר הטרחה: ${updateError.message}`
        );
      }

      setFeeContractUrl(contractUrl);
      onCaseUpdated(
        updatedData || {
          ...caseItem,
          status: "assigned",
          signed_agreement_url: signedAgreementUrl,
          fee_contract_url: contractUrl,
        }
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "אירעה שגיאה בהעלאת הסכם שכר הטרחה";
      setErrorMsg(message);
    } finally {
      setUploadingContract(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* כותרת המודל */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              {isSigned ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <FileSignature className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {isSigned
                  ? "תיק הוקצה בהצלחה – פרטי הלקוח"
                  : "הסכם הפניה והמחאת זכות"}
              </h2>
              <p className="text-xs text-slate-300">
                תחום: {caseItem.category} | עיר: {caseItem.city}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isSigned && (
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  remainingSeconds < 180
                    ? "bg-red-500/20 text-red-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>נעול עבורך: {formatTime(remainingSeconds)}</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="סגור חלון"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* תוכן המודל */}
        <div className="p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isSigned ? (
            <>
              {/* נוסח ההסכם */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 max-h-52 overflow-y-auto space-y-2">
                <p className="font-bold text-slate-900">
                  הסכם הפניית לקוח והמחאת זכות בלתי חוזרת (תיק #{caseItem.id.slice(0, 8)})
                </p>
                <p>
                  1. עורך הדין המקבל מאשר כי פרטי הלקוח בתיק בתחום{" "}
                  <strong>{caseItem.category}</strong> בעיר{" "}
                  <strong>{caseItem.city}</strong> נמסרים לו באמצעות הפלטפורמה
                  לצורך התקשרות בהסכם שכר טרחה.
                </p>
                <p>
                  2. עורך הדין המקבל מתחייב לשלם לעורך הדין המפנה דמי הפניה בשיעור
                  המוסכם מכל שכר טרחה שייגבה בגין הטיפול בתיק, בהתאם לכללי לשכת עורכי
                  הדין (אתיקה מקצועית).
                </p>
                <p>
                  3. עם החתימה על הסכם שכר טרחה מול הלקוח, מתחייב עורך הדין המקבל
                  להעלות עותק חתום של ההסכם למערכת לצורך שקיפות ובקרה.
                </p>
                <p>
                  4. סודיות: במידה ולא תשתכלל התקשרות עם הלקוח, עורך הדין המקבל
                  מתחייב לשמור בסודיות מוחלטת את פרטי הלקוח ולא לעשות בהם כל שימוש.
                </p>
              </div>

              {/* אזור החתימה הדיגיטלית */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800">
                    חתימה דיגיטלית של עורך הדין המקבל (בעכבר או במגע):
                  </label>
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>נקה חתימה</span>
                  </button>
                </div>

                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white overflow-hidden transition-colors hover:border-slate-400">
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    penColor="#0f172a"
                    backgroundColor="rgba(255,255,255,1)"
                    canvasProps={{
                      className: "w-full h-44 cursor-crosshair",
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  חתימתך מהווה אישור מחייב לתנאי הסכם ההפניה והמחאת הזכות. לאחר
                  האישור ייחשפו פרטי הלקוח המלאים.
                </p>
              </div>

              {/* כפתורי פעולה */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClearSignature}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>נקה חתימה</span>
                </button>

                <button
                  type="button"
                  onClick={handleSignAndApprove}
                  disabled={submitting || remainingSeconds <= 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>שומר חתימה ומקצה תיק...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-amber-400" />
                      <span>חתום ואשר</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* שער חשיפת פרטי לקוח והעלאת הסכם שכר טרחה */
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-bold text-emerald-950 text-base">
                    הסכם ההפניה נחתם והתיק הוקצה אליך!
                  </h3>
                  <p className="text-sm text-emerald-800">
                    כעת באפשרותך ליצור קשר ישיר עם הלקוח ולהעלות את הסכם שכר הטרחה
                    החתום.
                  </p>
                </div>
              </div>

              {/* כרטיס פרטי הלקוח החשופים */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  פרטי הלקוח המלאים
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 rounded-xl bg-white p-4 border border-slate-200 shadow-2xs">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500">
                        שם מלא של הלקוח
                      </span>
                      <span className="text-base font-bold text-slate-900">
                        {caseItem.client_name || "לא צוין"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl bg-white p-4 border border-slate-200 shadow-2xs">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500">
                        טלפון ליצירת קשר
                      </span>
                      <a
                        href={`tel:${caseItem.client_phone}`}
                        className="text-base font-bold text-emerald-700 hover:underline"
                        dir="ltr"
                      >
                        {caseItem.client_phone || "לא צוין"}
                      </a>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-4 border border-slate-200">
                  <span className="block text-xs text-slate-500 mb-1">
                    תיאור המקרה:
                  </span>
                  <p className="text-sm text-slate-800 whitespace-pre-line">
                    {caseItem.description}
                  </p>
                </div>
              </div>

              {/* העלאת עותק מהסכם שכר הטרחה החתום */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      הסכם שכר טרחה חתום מול הלקוח
                    </h4>
                    <p className="text-xs text-slate-500">
                      לאחר החתמת הלקוח, העלה לכאן עותק מהסכם שכר הטרחה החתום (PDF או
                      תמונה).
                    </p>
                  </div>

                  {signedAgreementUrl && (
                    <a
                      href={signedAgreementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                    >
                      <span>צפה בחתימת הסכם ההפניה</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {feeContractUrl ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2.5 text-emerald-800 text-sm font-medium">
                      <FileCheck className="h-5 w-5 text-emerald-600" />
                      <span>הסכם שכר הטרחה הועלה ונשמר במערכת</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={feeContractUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        <span>צפה בקובץ</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <label className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900 underline">
                        החלף קובץ
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={handleUploadFeeContract}
                          disabled={uploadingContract}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-900 hover:bg-slate-100">
                    {uploadingContract ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
                        <span>מעלה הסכם שכר טרחה...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-amber-600" />
                        <span>העלאת עותק מהסכם שכר הטרחה החתום</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleUploadFeeContract}
                      disabled={uploadingContract}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  סיום וסגירה
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
