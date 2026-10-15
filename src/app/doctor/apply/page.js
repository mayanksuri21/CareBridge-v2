"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Card";
import { HeartPulse, Stethoscope, Mail, Lock, Phone, UploadCloud, AlertCircle, CheckCircle2, FileText, ArrowRight, Clock, ShieldAlert } from "lucide-react";
import { uploadDoctorCredentialDocument } from "../../../lib/doctorDocumentActions";

export default function DoctorApplyPage() {
  const router = useRouter();
  const supabase = createClient();

  // Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [qualification, setQualification] = useState("");
  const [institution, setInstitution] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [issuingCouncil, setIssuingCouncil] = useState("National Medical Commission (NMC)");
  const [specialization, setSpecialization] = useState("General Medicine");
  const [experienceYears, setExperienceYears] = useState("5");
  const [languages, setLanguages] = useState(["English", "Hindi"]);
  const [consultationFee, setConsultationFee] = useState("500");
  const [bio, setBio] = useState("");

  // Document files
  const [nmcCertFile, setNmcCertFile] = useState(null);
  const [degreeFile, setDegreeFile] = useState(null);

  // Status state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Check if user is already signed in on mount
  const [existingUser, setExistingUser] = useState(null);

  React.useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setExistingUser(session.user);
        setEmail(session.user.email || "");
        if (session.user.user_metadata?.full_name) {
          setFullName(session.user.user_metadata.full_name);
        }
      }
    }
    checkAuth();
  }, []);

  const handleLanguageToggle = (lang) => {
    if (languages.includes(lang)) {
      if (languages.length > 1) {
        setLanguages(languages.filter((l) => l !== lang));
      }
    } else {
      setLanguages([...languages, lang]);
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    // Validate documents
    if (!nmcCertFile) {
      setErrorMsg("Please upload your NMC / State Medical Council Registration Certificate.");
      return;
    }
    if (nmcCertFile.size > 5 * 1024 * 1024) {
      setErrorMsg("Registration Certificate must be under 5 MB.");
      return;
    }
    if (degreeFile && degreeFile.size > 5 * 1024 * 1024) {
      setErrorMsg("Degree Certificate must be under 5 MB.");
      return;
    }

    setLoading(true);

    try {
      // 1. Establish verified authenticated session
      let currentUserId = null;

      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();

      if (existingSession?.user) {
        currentUserId = existingSession.user.id;
      } else {
        // Sign up doctor identity
        if (!password || password.length < 6) {
          setErrorMsg("Please provide a password of at least 6 characters for your doctor login.");
          setLoading(false);
          return;
        }

        // First, check if the account already exists and credentials work (or can be signed in directly)
        const { data: directSignIn, error: directSignInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!directSignInError && directSignIn?.session?.user) {
          currentUserId = directSignIn.session.user.id;
        } else {
          // If sign in failed because credentials didn't match an existing account, attempt sign up
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role: "doctor",
              },
              emailRedirectTo: `${window.location.origin}/auth/callback?next=/doctor/application-status`,
            },
          });

          if (signUpError) {
            if (signUpError.message?.toLowerCase().includes("rate limit") || signUpError.code === "over_email_send_rate_limit") {
              // Rate limit was hit from repeated attempts. Try to see if the user was already created
              const { data: retrySignIn, error: retryError } = await supabase.auth.signInWithPassword({
                email,
                password,
              });

              if (!retryError && retrySignIn?.session?.user) {
                currentUserId = retrySignIn.session.user.id;
              } else {
                setErrorMsg("Supabase email rate limit exceeded for this email. Please wait a minute or sign in if you already created this account.");
                setLoading(false);
                return;
              }
            } else if (signUpError.message?.toLowerCase().includes("already registered")) {
              setErrorMsg("This email is already registered. Please sign in to submit or check your application.");
              setLoading(false);
              return;
            } else {
              throw signUpError;
            }
          } else {
            // Check session from signup
            if (signUpData?.session?.user) {
              currentUserId = signUpData.session.user.id;
            } else if (signUpData?.user) {
              // Try signing in immediately if auto-confirm is on
              const { data: postSignIn } = await supabase.auth.signInWithPassword({
                email,
                password,
              });
              currentUserId = postSignIn?.session?.user?.id || signUpData.user.id;
            }
          }
        }
      }

      if (!currentUserId) {
        throw new Error("Unable to establish authenticated doctor session. Please sign in and try again.");
      }

      // 2. Prevent duplicate applications
      const { data: existingApp } = await supabase
        .from("doctor_applications")
        .select("id, status")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (existingApp) {
        setIsSubmitted(true);
        setLoading(false);
        return;
      }

      // 3. Create Doctor Application Record
      const { data: appData, error: appError } = await supabase
        .from("doctor_applications")
        .insert({
          user_id: currentUserId,
          full_name: fullName,
          email,
          phone,
          qualification,
          institution,
          registration_number: registrationNumber,
          issuing_council: issuingCouncil,
          specialization,
          experience_years: parseInt(experienceYears, 10),
          consultation_languages: languages,
          consultation_fee: parseFloat(consultationFee),
          bio,
          status: "pending",
        })
        .select("id")
        .single();

      if (appError) {
        throw appError;
      }

      const applicationId = appData.id;

      // 4. Upload Documents using safe server action
      const uploadDocHelper = async (file, docType) => {
        const docFormData = new FormData();
        docFormData.append("application_id", applicationId);
        docFormData.append("document_type", docType);
        docFormData.append("file", file);

        const res = await uploadDoctorCredentialDocument(docFormData);
        if (!res.success) {
          throw new Error(res.error || `Failed to upload ${docType}.`);
        }
      };

      // Registration certificate is strictly required
      await uploadDocHelper(nmcCertFile, "nmc_registration_certificate");
      if (degreeFile) {
        await uploadDocHelper(degreeFile, "degree_certificate");
      }

      // Display dedicated application submitted state
      setIsSubmitted(true);
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit application. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 group mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white shadow-md">
              <HeartPulse className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900">
              Care<span className="text-brand-emerald">Bridge</span>
            </span>
          </Link>
          <div className="flex justify-center">
            <Badge variant="blue">Doctor Onboarding Portal</Badge>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Apply to Join CareBridge Medical Network
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Expand your practice across India. All medical practitioners undergo credential verification against NMC / State Council registers.
          </p>
        </div>

        {/* Form or Success Container */}
        {isSubmitted ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-lg card-elevation text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-brand-emerald flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                <Clock className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                Status: Pending Verification
              </span>

              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Application Submitted Successfully!
              </h2>

              <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                Your doctor registration request has been received. Our admin team will review your medical qualifications and registration documents. Your doctor account will remain inactive until your application is approved.
              </p>
            </div>

            <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-4 text-xs font-semibold text-amber-900 flex items-center justify-center gap-2 max-w-lg mx-auto">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>You cannot access the doctor dashboard until an administrator approves your application.</span>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/doctor/application-status" className="w-full sm:w-auto">
                <Button variant="primary" size="md" className="w-full font-bold">
                  Check Application Status
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
              <Link href="/" className="w-full sm:w-auto">
                <Button variant="outline" size="md" className="w-full font-semibold border-slate-300">
                  Return to Homepage
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-lg card-elevation">
            {errorMsg && (
              <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleApply} className="space-y-6">
              {/* Section 1: Doctor Identity & Contact */}
              <div>
                <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">
                  1. Personal & Contact Information
                </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name (with Dr. prefix)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Rajesh Kumar"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="doctor@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Portal Account Password {existingUser && <span className="text-slate-400 font-normal">(Signed in as {existingUser.email})</span>}
                  </label>
                  <input
                    type="password"
                    required={!existingUser}
                    disabled={!!existingUser}
                    placeholder={existingUser ? "Logged in session active" : "At least 6 characters"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Clinical Credentials */}
            <div>
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">
                2. Medical Qualifications & Registration
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Primary Medical Degree</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MBBS, MD (Medicine)"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Graduating University / Institute</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AIIMS New Delhi"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Medical Registration Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MCI-2015-84920"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Issuing Medical Council</label>
                  <select
                    value={issuingCouncil}
                    onChange={(e) => setIssuingCouncil(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  >
                    <option value="National Medical Commission (NMC)">National Medical Commission (NMC)</option>
                    <option value="Delhi Medical Council">Delhi Medical Council</option>
                    <option value="Maharashtra Medical Council">Maharashtra Medical Council</option>
                    <option value="Karnataka Medical Council">Karnataka Medical Council</option>
                    <option value="Punjab Medical Council">Punjab Medical Council</option>
                    <option value="Tamil Nadu Medical Council">Tamil Nadu Medical Council</option>
                    <option value="Other State Medical Council">Other State Medical Council</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Practice Details */}
            <div>
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">
                3. Specialty & Consultation Practice
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Primary Specialty</label>
                  <select
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  >
                    <option value="General Medicine">General Medicine</option>
                    <option value="Cardiology">Cardiology</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Pediatrics">Pediatrics</option>
                    <option value="Orthopedics">Orthopedics</option>
                    <option value="Gynecology">Gynecology</option>
                    <option value="Ophthalmology">Ophthalmology</option>
                    <option value="ENT">ENT</option>
                    <option value="Neurology">Neurology</option>
                    <option value="Psychiatry">Psychiatry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Experience (Years)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    required
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Proposed Fee (INR ₹)</label>
                  <input
                    type="number"
                    min="100"
                    step="50"
                    required
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                  />
                </div>
              </div>

              {/* Consultation Languages */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Consultation Languages
                </label>
                <div className="flex flex-wrap gap-2">
                  {["English", "Hindi", "Punjabi", "Gujarati", "Bengali", "Marathi", "Tamil", "Telugu"].map((lang) => (
                    <button
                      type="button"
                      key={lang}
                      onClick={() => handleLanguageToggle(lang)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        languages.includes(lang)
                          ? "bg-brand-emerald text-white border-brand-emerald shadow-sm"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-700 mb-1">Short Clinical Bio</label>
                <textarea
                  rows="2"
                  placeholder="Brief summary of clinical background, clinical interests, or hospital affiliations..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white"
                />
              </div>
            </div>

            {/* Section 4: Credential Documents */}
            <div>
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">
                4. Credential Verification Documents (PDF, JPEG, or PNG &lt; 5MB)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-dashed border-slate-300 rounded-2xl p-4 text-center bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <UploadCloud className="w-8 h-8 text-brand-emerald mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800">
                    NMC / State Registration Certificate *
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3">Required for verification</p>
                  <input
                    type="file"
                    required
                    accept=".pdf,image/png,image/jpeg"
                    onChange={(e) => setNmcCertFile(e.target.files[0] || null)}
                    className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-mint file:text-brand-emerald-dark hover:file:bg-emerald-100 cursor-pointer"
                  />
                  {nmcCertFile && (
                    <p className="text-xs text-brand-emerald font-semibold mt-2 truncate">
                      ✓ {nmcCertFile.name}
                    </p>
                  )}
                </div>

                <div className="border border-dashed border-slate-300 rounded-2xl p-4 text-center bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <FileText className="w-8 h-8 text-brand-blue mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800">
                    Highest Degree Certificate (Optional)
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3">MD, MS, DNB, or Diploma</p>
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg"
                    onChange={(e) => setDegreeFile(e.target.files[0] || null)}
                    className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-pale-blue file:text-brand-blue-dark hover:file:bg-blue-100 cursor-pointer"
                  />
                  {degreeFile && (
                    <p className="text-xs text-brand-blue font-semibold mt-2 truncate">
                      ✓ {degreeFile.name}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Documents are stored in a private, encrypted Supabase storage bucket accessible strictly by verified platform administrators.
              </p>
            </div>

            {/* Submit CTA */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <Link href="/doctor/login" className="text-xs font-bold text-slate-600 hover:text-brand-emerald">
                Already registered? Sign In to Portal
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={loading}
                className="w-full sm:w-auto font-bold shadow-md shadow-brand-emerald/20 px-8"
              >
                {loading ? "Submitting Application..." : "Submit Doctor Application"}
              </Button>
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
