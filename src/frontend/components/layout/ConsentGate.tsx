import { useState } from "react";
import {
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const CONSENT_KEY = "ddx_consent_accepted";

export function useConsent() {
  const [accepted, setAccepted] = useState(() => {
    try {
      return sessionStorage.getItem(CONSENT_KEY) === "true";
    } catch {
      return false;
    }
  });

  const grant = () => {
    try {
      sessionStorage.setItem(CONSENT_KEY, "true");
    } catch {
      /* ignore */
    }
    setAccepted(true);
  };

  const revoke = () => {
    try {
      sessionStorage.removeItem(CONSENT_KEY);
    } catch {
      /* ignore */
    }
    setAccepted(false);
  };

  return { accepted, grant, revoke };
}

export function ConsentGate({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <ShieldExclamationIcon className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-600" />
            <div className="space-y-2">
              <h1 className="text-2xl font-display text-slate-700 dark:text-slate-300">
                Access Declined
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You must accept the disclaimer to use ddx.care. This tool is not
                accessible without agreeing to the terms above.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeclined(false)}
              className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
            >
              Review terms again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full space-y-6">
          {/* Title */}
          <div className="text-center space-y-3">
            <ShieldExclamationIcon className="h-12 w-12 mx-auto text-red-500" />
            <h1 className="text-3xl font-display text-slate-900 dark:text-slate-100">
              Legal Disclaimer &amp; Terms of Use
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Please read carefully before proceeding
            </p>
          </div>

          {/* Warning Box */}
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-red-800 dark:text-red-300">
                <p className="font-bold text-base">
                  THIS IS A RESEARCH PROOF-OF-CONCEPT DEMO — NOT A MEDICAL
                  DEVICE
                </p>
                <p>
                  This website is for{" "}
                  <strong>research and demonstration purposes only</strong>. It
                  has <strong>no regulatory approval</strong> from the FDA or
                  any other agency. It is <strong>not HIPAA compliant</strong>.
                  It is <strong>not intended and may not be used</strong> for
                  medical diagnosis, treatment decisions, or patient care.
                </p>
                <p className="font-semibold">
                  DO NOT enter real patient data, protected health information
                  (PHI), or any personally identifiable health information.
                </p>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                1. Nature of This Tool
              </h2>
              <p>
                ddx.care is a proof-of-concept research demo that uses AI
                language models to generate differential diagnosis suggestions.
                It is <strong>not a medical device</strong>, has{" "}
                <strong>not been validated</strong> for clinical accuracy, and
                carries <strong>no FDA or regulatory approval</strong> of any
                kind. AI outputs may be inaccurate, incomplete, or fabricated.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                2. Not Medical Advice
              </h2>
              <p>
                Nothing on this website constitutes medical advice, diagnosis,
                or treatment. All outputs are AI-generated suggestions for{" "}
                <strong>research purposes only</strong>. Never rely on any
                output from this tool for any medical decision — always consult
                a qualified licensed healthcare professional.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                3. No HIPAA Compliance — No Patient Data
              </h2>
              <p>
                This tool is <strong>not HIPAA compliant</strong> and provides
                no safeguards for protected health information. You must{" "}
                <strong>not</strong> enter any real patient data, PHI, or
                personally identifiable health information. Any data you enter
                is processed by third-party AI APIs without HIPAA protections.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                4. Assumption of All Risk
              </h2>
              <p>
                You use this tool <strong>entirely at your own risk</strong>.
                The tool is provided <strong>"AS IS" and "AS AVAILABLE"</strong>{" "}
                without warranty of any kind, express or implied, including but
                not limited to warranties of accuracy, reliability,
                merchantability, or fitness for any particular purpose.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                5. Limitation of Liability
              </h2>
              <p>
                To the fullest extent permitted by law, the operators,
                developers, and affiliates of ddx.care ("the Operators"){" "}
                <strong>disclaim all liability</strong> for any and all losses,
                damages, injuries, or harms — direct, indirect, incidental,
                special, or consequential — arising from or related to your use
                of or reliance on this tool or its outputs. This includes,
                without limitation, any liability for medical decisions made
                based on outputs from this tool.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                6. Indemnification
              </h2>
              <p>
                You agree to indemnify, defend, and hold harmless the Operators
                from any claims, damages, losses, or expenses (including
                reasonable attorneys' fees) arising from your use of this tool,
                your violation of these terms, or your violation of any
                applicable law or regulation.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                7. No Doctor-Patient Relationship
              </h2>
              <p>
                Use of this tool does not create a doctor-patient,
                therapist-client, or any other professional healthcare
                relationship between you and the Operators or any AI system.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                8. Severability & General Provisions
              </h2>
              <p>
                These terms shall be governed by and construed in accordance
                with applicable law, without regard to conflict of law
                principles. If any provision is found unenforceable or invalid,
                that provision shall be limited or eliminated to the minimum
                extent necessary so that the remaining provisions remain in full
                force and effect. The failure of the Operators to enforce any
                right or provision of these terms shall not constitute a waiver
                of such right or provision.
              </p>
            </section>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/30">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-amber-400 text-primary focus:ring-primary accent-current"
            />
            <span className="text-sm text-amber-900 dark:text-amber-200 font-medium">
              I have read and understand the above disclaimer. I acknowledge
              this is a research demo, not a medical device, not HIPAA
              compliant, and that I accept ALL risk and release the Operators
              from ANY AND ALL liability. I will not enter real patient data or
              use this tool for medical decisions.
            </span>
          </label>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onAccept}
              disabled={!checked}
              className={`flex-1 py-3 px-6 rounded-xl text-sm font-semibold transition-all ${
                checked
                  ? "bg-primary text-white hover:bg-primary-dark shadow-lg"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
              }`}
            >
              I Accept — Enter ddx.care
            </button>
            <button
              type="button"
              onClick={() => setDeclined(true)}
              className="flex-1 py-3 px-6 rounded-xl text-sm font-semibold border-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              I Do Not Accept
            </button>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-slate-400 dark:text-slate-600">
            Consent is stored for this browser session only. Closing this tab
            will require re-acceptance.
          </p>
        </div>
      </div>
    </div>
  );
}
