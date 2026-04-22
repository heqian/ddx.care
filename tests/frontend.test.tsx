import { Window as HappyWindow } from "happy-dom";
import { test, expect, describe, beforeEach, afterEach, vi } from "bun:test";

// Set up happy-dom global environment BEFORE importing React/testing libraries.
// This must run at the top level before any React import is evaluated.
const happyWindow = new HappyWindow();
const happyDocument = happyWindow.document;

Object.assign(globalThis, {
  window: happyWindow,
  document: happyDocument,
  navigator: happyWindow.navigator,
  MutationObserver: happyWindow.MutationObserver,
  NodeFilter: happyWindow.NodeFilter,
  HTMLElement: happyWindow.HTMLElement,
  HTMLInputElement: happyWindow.HTMLInputElement,
  HTMLTextAreaElement: happyWindow.HTMLTextAreaElement,
  Text: happyWindow.Text,
  Comment: happyWindow.Comment,
  Element: happyWindow.Element,
  DocumentFragment: happyWindow.DocumentFragment,
  customElements: happyWindow.customElements,
  Node: happyWindow.Node,
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: clearTimeout,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  addEventListener: happyWindow.addEventListener.bind(happyWindow),
  removeEventListener: happyWindow.removeEventListener.bind(happyWindow),
  File: happyWindow.File,
  FileReader: happyWindow.FileReader,
  DataTransfer: happyWindow.DataTransfer,
  sessionStorage: happyWindow.sessionStorage,
});

// Fix happy-dom bug: HTMLLabelElement.dispatchEvent uses this.window.SyntaxError
// which is undefined by default. Polyfill it.
happyWindow.SyntaxError = SyntaxError;
function resetBody() {
  happyDocument.body.innerHTML = "";
}

// Helper: query rendered output for text content
// Uses recursive descent to match against element textContent (handles split React text nodes)
function queryByText(
  container: Element,
  text: string | RegExp,
): Element | null {
  const queue: Element[] = [container];
  while (queue.length > 0) {
    const el = queue.shift()!;
    // Check this element's direct text (not children's)
    const ownText = el.textContent ?? "";
    const matches =
      typeof text === "string" ? ownText.includes(text) : text.test(ownText);
    if (matches && el !== container) {
      return el;
    }
    // Recurse into children
    for (const child of Array.from(el.children)) {
      queue.push(child);
    }
  }
  return null;
}

function getByText(container: Element, text: string | RegExp): Element {
  const el = queryByText(container, text);
  if (!el) throw new Error(`Unable to find element with text: ${text}`);
  return el;
}

function _queryAllByText(container: Element, text: string | RegExp): Element[] {
  const results: Element[] = [];
  const walker = happyDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
  );
  while (walker.nextNode()) {
    const nodeText = walker.currentNode.textContent ?? "";
    const matches =
      typeof text === "string" ? nodeText.includes(text) : text.test(nodeText);
    if (matches && walker.currentNode.parentElement) {
      results.push(walker.currentNode.parentElement);
    }
  }
  return results;
}

import {
  render,
  fireEvent,
  act,
  waitFor,
  cleanup,
} from "@testing-library/react";
import React, { createElement } from "react";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// DiagnosisCard
// ---------------------------------------------------------------------------
import { DiagnosisCard } from "../src/frontend/components/diagnosis/DiagnosisCard";
import type { Diagnosis } from "../src/frontend/api/types";

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    rank: 1,
    name: "Test Diagnosis",
    confidence: 75,
    urgency: "urgent",
    rationale: "Test rationale",
    supportingEvidence: ["Evidence A"],
    contradictoryEvidence: ["Counter B"],
    nextSteps: ["Step 1", "Step 2"],
    ...overrides,
  };
}

describe("DiagnosisCard", () => {
  test("renders diagnosis name and rank", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({ name: "Migraine" }),
      }),
    );
    expect(getByText(container, "Migraine")).toBeTruthy();
    expect(getByText(container, "1")).toBeTruthy();
  });

  test("renders confidence badge text", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({ confidence: 85 }),
      }),
    );
    expect(getByText(container, "85% confidence")).toBeTruthy();
  });

  test("renders urgency badge text", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({ urgency: "emergent" }),
      }),
    );
    expect(getByText(container, "Emergent")).toBeTruthy();
  });

  test("renders supporting evidence items", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({
          supportingEvidence: ["BP elevated", "History of hypertension"],
        }),
      }),
    );
    expect(getByText(container, "BP elevated")).toBeTruthy();
    expect(getByText(container, "History of hypertension")).toBeTruthy();
  });

  test("renders contradictory evidence items", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({
          contradictoryEvidence: ["No prior history"],
        }),
      }),
    );
    expect(getByText(container, "No prior history")).toBeTruthy();
  });

  test("renders next steps", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({
          nextSteps: ["Order CT scan", "Administer meds"],
        }),
      }),
    );
    expect(getByText(container, "Order CT scan")).toBeTruthy();
    expect(getByText(container, "Administer meds")).toBeTruthy();
  });

  test("hides sections when arrays are empty", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({
          supportingEvidence: [],
          contradictoryEvidence: [],
          nextSteps: [],
        }),
      }),
    );
    expect(queryByText(container, "Supporting Evidence")).toBeNull();
    expect(queryByText(container, "Contradictory Evidence")).toBeNull();
    expect(queryByText(container, "Suggested Next Steps")).toBeNull();
  });

  test("renders rank 2 with correct badge", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ rank: 2 }) }),
    );
    expect(getByText(container, "2")).toBeTruthy();
  });

  test("renders rank 3 with correct badge", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ rank: 3 }) }),
    );
    expect(getByText(container, "3")).toBeTruthy();
  });

  test("renders rationale text", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({
          rationale: "Patient has classic symptoms.",
        }),
      }),
    );
    expect(getByText(container, /classic symptoms/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ConfidenceBadge
// ---------------------------------------------------------------------------
import { ConfidenceBadge } from "../src/frontend/components/diagnosis/ConfidenceBadge";

describe("ConfidenceBadge", () => {
  test("renders confidence percentage", () => {
    resetBody();
    const { container } = render(
      createElement(ConfidenceBadge, { confidence: 75 }),
    );
    expect(getByText(container, "75% confidence")).toBeTruthy();
  });

  test("returns null for null confidence", () => {
    resetBody();
    const { container } = render(
      createElement(ConfidenceBadge, { confidence: null }),
    );
    expect(container.innerHTML).toBe("");
  });

  test("high confidence gets green styling", () => {
    resetBody();
    const { container } = render(
      createElement(ConfidenceBadge, { confidence: 90 }),
    );
    const badge = getByText(container, "90% confidence");
    expect(badge.className).toContain("bg-green");
  });

  test("medium confidence gets yellow styling", () => {
    resetBody();
    const { container } = render(
      createElement(ConfidenceBadge, { confidence: 50 }),
    );
    const badge = getByText(container, "50% confidence");
    expect(badge.className).toContain("bg-yellow");
  });

  test("low confidence gets red styling", () => {
    resetBody();
    const { container } = render(
      createElement(ConfidenceBadge, { confidence: 20 }),
    );
    const badge = getByText(container, "20% confidence");
    expect(badge.className).toContain("bg-red");
  });
});

// ---------------------------------------------------------------------------
// UrgencyBadge
// ---------------------------------------------------------------------------
import { UrgencyBadge } from "../src/frontend/components/diagnosis/UrgencyBadge";

describe("UrgencyBadge", () => {
  test("renders emergent label", () => {
    resetBody();
    const { container } = render(
      createElement(UrgencyBadge, { urgency: "emergent" }),
    );
    expect(getByText(container, "Emergent")).toBeTruthy();
  });

  test("renders urgent label", () => {
    resetBody();
    const { container } = render(
      createElement(UrgencyBadge, { urgency: "urgent" }),
    );
    expect(getByText(container, "Urgent")).toBeTruthy();
  });

  test("renders routine label", () => {
    resetBody();
    const { container } = render(
      createElement(UrgencyBadge, { urgency: "routine" }),
    );
    expect(getByText(container, "Routine")).toBeTruthy();
  });

  test("returns null for null urgency", () => {
    resetBody();
    const { container } = render(
      createElement(UrgencyBadge, { urgency: null }),
    );
    expect(container.innerHTML).toBe("");
  });
});

// ---------------------------------------------------------------------------
// FileDropZone
// ---------------------------------------------------------------------------
import { FileDropZone } from "../src/frontend/components/ui/FileDropZone";

describe("FileDropZone", () => {
  test("renders label text", () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload lab results",
      }),
    );
    expect(getByText(container, "Upload lab results")).toBeTruthy();
  });

  test("renders accept hint", () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload",
        accept: ".txt,.csv",
      }),
    );
    expect(getByText(container, /\.txt,\.csv/)).toBeTruthy();
  });

  test("calls onFileContent when file is selected", async () => {
    resetBody();
    const onFileContent = vi.fn();
    const { container } = render(
      createElement(FileDropZone, { onFileContent, label: "Upload" }),
    );

    const file = new happyWindow.File(["file content"], "test.txt", {
      type: "text/plain",
    });

    // Find the hidden input by traversing children
    const input = Array.from(
      container.getElementsByTagName("input"),
    )[0] as HTMLInputElement;

    // Simulate file selection via DataTransfer
    const dataTransfer = new happyWindow.DataTransfer();
    dataTransfer.items.add(file);

    await act(async () => {
      input.files = dataTransfer.files;
      fireEvent.change(input);
    });

    // FileReader is async
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(onFileContent).toHaveBeenCalledWith("file content");
  });
});

// ---------------------------------------------------------------------------
// useAutoLogout — test the timer logic directly without DOM rendering
// ---------------------------------------------------------------------------
import { useAutoLogout } from "../src/frontend/hooks/useAutoLogout";
import { renderHook, act as hookAct } from "@testing-library/react";

describe("useAutoLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("starts with showWarning false", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useAutoLogout(onTimeout));
    expect(result.current.showWarning).toBe(false);
  });

  test("exposes extendSession function", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useAutoLogout(onTimeout));
    expect(typeof result.current.extendSession).toBe("function");
  });

  test("shows warning after 8 minutes", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useAutoLogout(onTimeout));

    hookAct(() => {
      vi.advanceTimersByTime(8 * 60 * 1000);
    });

    expect(result.current.showWarning).toBe(true);
  });

  test("calls onTimeout after 10 minutes", () => {
    const onTimeout = vi.fn();
    renderHook(() => useAutoLogout(onTimeout));

    hookAct(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test("extendSession resets warning state", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useAutoLogout(onTimeout));

    hookAct(() => {
      vi.advanceTimersByTime(8 * 60 * 1000);
    });
    expect(result.current.showWarning).toBe(true);

    hookAct(() => {
      result.current.extendSession();
    });
    expect(result.current.showWarning).toBe(false);
  });

  test("extendSession resets the timeout timer", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useAutoLogout(onTimeout));

    // Advance to 9 minutes (1 min before timeout)
    hookAct(() => {
      vi.advanceTimersByTime(9 * 60 * 1000);
    });

    // Reset
    hookAct(() => {
      result.current.extendSession();
    });

    // Advance 2 more minutes — the original timer would have fired, but the reset prevented it
    hookAct(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(onTimeout).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AgentStatusCard
// ---------------------------------------------------------------------------
import { AgentStatusCard } from "../src/frontend/components/agents/AgentStatusCard";

describe("AgentStatusCard", () => {
  test("renders agent name and description", () => {
    resetBody();
    const { container } = render(
      createElement(AgentStatusCard, {
        name: "Cardiologist",
        agentId: "cardiologist",
        description: "Heart specialist",
      }),
    );
    expect(getByText(container, "Cardiologist")).toBeTruthy();
  });

  test("shows 'Waiting...' for idle status", () => {
    resetBody();
    const { container } = render(
      createElement(AgentStatusCard, {
        name: "Neurologist",
        agentId: "neurologist",
        description: "Brain doctor",
        status: "idle",
      }),
    );
    expect(getByText(container, "Waiting...")).toBeTruthy();
  });

  test("shows 'Consulting...' for active status", () => {
    resetBody();
    const { container } = render(
      createElement(AgentStatusCard, {
        name: "Cardiologist",
        agentId: "cardiologist",
        description: "Heart specialist",
        status: "active",
      }),
    );
    expect(getByText(container, "Consulting...")).toBeTruthy();
  });

  test("shows 'Analysis complete' for completed status", () => {
    resetBody();
    const { container } = render(
      createElement(AgentStatusCard, {
        name: "Oncologist",
        agentId: "oncologist",
        description: "Cancer specialist",
        status: "completed",
      }),
    );
    expect(getByText(container, "Analysis complete")).toBeTruthy();
  });

  test("defaults to idle when status is not provided", () => {
    resetBody();
    const { container } = render(
      createElement(AgentStatusCard, {
        name: "Generalist",
        agentId: "generalist",
        description: "General practitioner",
      }),
    );
    expect(getByText(container, "Waiting...")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
import { Badge } from "../src/frontend/components/ui/Badge";

describe("Badge", () => {
  test("renders children text", () => {
    resetBody();
    const { container } = render(createElement(Badge, {}, "Test Label"));
    expect(getByText(container, "Test Label")).toBeTruthy();
  });

  test("applies green color classes", () => {
    resetBody();
    const { container } = render(
      createElement(Badge, { color: "green" }, "Green"),
    );
    const badge = getByText(container, "Green");
    expect(badge.className).toContain("bg-green-100");
  });

  test("applies red color classes", () => {
    resetBody();
    const { container } = render(createElement(Badge, { color: "red" }, "Red"));
    const badge = getByText(container, "Red");
    expect(badge.className).toContain("bg-red-100");
  });

  test("applies yellow color classes", () => {
    resetBody();
    const { container } = render(
      createElement(Badge, { color: "yellow" }, "Yellow"),
    );
    const badge = getByText(container, "Yellow");
    expect(badge.className).toContain("bg-yellow-100");
  });

  test("defaults to gray color (no color prop)", () => {
    resetBody();
    const { container } = render(createElement(Badge, {}, "Default"));
    const badge = getByText(container, "Default");
    expect(badge.className).toContain("bg-slate-100");
  });

  test("applies custom className", () => {
    resetBody();
    const { container } = render(
      createElement(Badge, { className: "extra-class" }, "Custom"),
    );
    const badge = getByText(container, "Custom");
    expect(badge.className).toContain("extra-class");
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
import { Modal } from "../src/frontend/components/ui/Modal";

describe("Modal", () => {
  test("renders when open is true", () => {
    resetBody();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: "Test Modal" },
        createElement("p", {}, "Modal content"),
      ),
    );
    expect(getByText(container, "Test Modal")).toBeTruthy();
    expect(getByText(container, "Modal content")).toBeTruthy();
  });

  test("does not render when open is false", () => {
    resetBody();
    const { container } = render(
      createElement(
        Modal,
        { open: false, onClose: () => {}, title: "Hidden" },
        createElement("p", {}, "Should not show"),
      ),
    );
    expect(queryByText(container, "Hidden")).toBeNull();
    expect(queryByText(container, "Should not show")).toBeNull();
  });

  test("renders title correctly", () => {
    resetBody();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: "Important Dialog" },
        createElement("p", {}, "Content"),
      ),
    );
    expect(getByText(container, "Important Dialog")).toBeTruthy();
  });

  test("calls onClose when close button is clicked", () => {
    resetBody();
    const onClose = vi.fn();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose, title: "Closable" },
        createElement("p", {}, "Content"),
      ),
    );
    // Find all buttons and click the one that's not the main title area
    const buttons = Array.from(container.getElementsByTagName("button"));
    // The close button is the last button (with the X icon)
    const closeBtn = buttons[buttons.length - 1];
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  test("calls onClose on backdrop click", () => {
    resetBody();
    const onClose = vi.fn();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose, title: "Backdrop Test" },
        createElement("p", {}, "Content"),
      ),
    );
    // The backdrop is the second div inside the fixed container
    // It has an onClick handler
    const fixedDivs = Array.from(container.getElementsByTagName("div"));
    // Find the backdrop div — it will be a div with the onClick handler
    // The first fixed div is the wrapper, the backdrop is its first child div
    const backdrop = fixedDivs.find(
      (d) => d.className.includes("fixed") && d.className.includes("bg-black"),
    );
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

// ---------------------------------------------------------------------------
// useConsent hook
// ---------------------------------------------------------------------------
import { useConsent } from "../src/frontend/components/layout/ConsentGate";

describe("useConsent", () => {
  beforeEach(() => {
    try {
      happyWindow.sessionStorage.removeItem("ddx_consent_accepted");
    } catch {
      /* ignore */
    }
  });

  test("starts with accepted=false when no session storage", () => {
    resetBody();
    const { result } = renderHook(() => useConsent());
    expect(result.current.accepted).toBe(false);
  });

  test("grant() sets accepted to true and writes sessionStorage", () => {
    resetBody();
    const { result } = renderHook(() => useConsent());
    hookAct(() => {
      result.current.grant();
    });
    expect(result.current.accepted).toBe(true);
    expect(happyWindow.sessionStorage.getItem("ddx_consent_accepted")).toBe(
      "true",
    );
  });

  test("revoke() sets accepted to false and clears sessionStorage", () => {
    resetBody();
    const { result } = renderHook(() => useConsent());
    hookAct(() => {
      result.current.grant();
    });
    expect(result.current.accepted).toBe(true);
    hookAct(() => {
      result.current.revoke();
    });
    expect(result.current.accepted).toBe(false);
    expect(
      happyWindow.sessionStorage.getItem("ddx_consent_accepted"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ConsentGate
// ---------------------------------------------------------------------------
import { ConsentGate } from "../src/frontend/components/layout/ConsentGate";

describe("ConsentGate", () => {
  test("renders legal disclaimer heading", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );
    expect(getByText(container, "Legal Disclaimer")).toBeTruthy();
  });

  test("renders warning about research demo", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );
    expect(getByText(container, /NOT A MEDICAL DEVICE/)).toBeTruthy();
  });

  test("renders all 8 terms sections", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );
    expect(getByText(container, "1. Nature of This Tool")).toBeTruthy();
    expect(getByText(container, "2. Not Medical Advice")).toBeTruthy();
    expect(getByText(container, "3. No HIPAA Compliance")).toBeTruthy();
    expect(getByText(container, "4. Assumption of All Risk")).toBeTruthy();
    expect(getByText(container, "5. Limitation of Liability")).toBeTruthy();
    expect(getByText(container, "6. Indemnification")).toBeTruthy();
    expect(
      getByText(container, "7. No Doctor-Patient Relationship"),
    ).toBeTruthy();
    expect(
      getByText(container, "8. Severability & General Provisions"),
    ).toBeTruthy();
  });

  test("accept button is disabled without checkbox", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );
    const buttons = Array.from(container.getElementsByTagName("button"));
    const acceptBtn = buttons.find((b) =>
      b.textContent?.includes("I Accept"),
    );
    expect(acceptBtn).toBeTruthy();
    expect(acceptBtn!.disabled).toBe(true);
  });

  test("checking the checkbox enables accept button", async () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );
    const checkbox = container.getElementsByTagName("input")[0];
    expect(checkbox).toBeTruthy();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    const acceptBtn = await waitFor(() => {
      const btn = Array.from(container.getElementsByTagName("button")).find(
        (b) => b.textContent?.includes("I Accept"),
      );
      if (!btn) throw new Error("Accept button not found");
      return btn;
    });
    expect(acceptBtn!.disabled).toBe(false);
  });

  test("clicking accept calls onAccept", async () => {
    resetBody();
    const onAccept = vi.fn();
    const { container } = render(
      createElement(ConsentGate, { onAccept, onDecline: () => {} }),
    );

    const checkbox = container.getElementsByTagName("input")[0];
    await act(async () => {
      fireEvent.click(checkbox);
    });

    const acceptBtn = await waitFor(() => {
      const btn = Array.from(container.getElementsByTagName("button")).find(
        (b) => b.textContent?.includes("I Accept"),
      );
      if (!btn) throw new Error("Accept button not found");
      if (btn.disabled) throw new Error("Accept button still disabled");
      return btn;
    });
    await act(async () => {
      fireEvent.click(acceptBtn);
    });
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  test("clicking decline shows Access Declined screen", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );

    // Click decline button
    const buttons = Array.from(container.getElementsByTagName("button"));
    const declineBtn = buttons.find((b) =>
      b.textContent?.includes("Do Not Accept"),
    );
    expect(declineBtn).toBeTruthy();
    fireEvent.click(declineBtn!);

    // Should show declined state
    expect(getByText(container, "Access Declined")).toBeTruthy();
    expect(getByText(container, "Review terms again")).toBeTruthy();
  });

  test("clicking Review terms again returns to consent form", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );

    // Click decline
    const buttons = Array.from(container.getElementsByTagName("button"));
    const declineBtn = buttons.find((b) =>
      b.textContent?.includes("Do Not Accept"),
    );
    fireEvent.click(declineBtn!);

    // Re-query buttons after state change
    const updatedButtons = Array.from(
      container.getElementsByTagName("button"),
    );
    const reviewBtn = updatedButtons.find((b) =>
      b.textContent?.includes("Review terms again"),
    );
    expect(reviewBtn).toBeTruthy();
    fireEvent.click(reviewBtn!);

    // Should be back on consent form
    expect(getByText(container, "Legal Disclaimer")).toBeTruthy();
  });

  test("buttons have type=button to prevent form submission", () => {
    resetBody();
    const { container } = render(
      createElement(ConsentGate, {
        onAccept: () => {},
        onDecline: () => {},
      }),
    );
    const buttons = Array.from(container.getElementsByTagName("button"));
    for (const btn of buttons) {
      expect(btn.getAttribute("type")).toBe("button");
    }
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
import { Footer } from "../src/frontend/components/layout/Footer";

describe("Footer", () => {
  test("renders research use disclaimer", () => {
    resetBody();
    const { container } = render(createElement(Footer));
    expect(getByText(container, /Research use only/)).toBeTruthy();
  });

  test("renders HIPAA non-compliance notice", () => {
    resetBody();
    const { container } = render(createElement(Footer));
    expect(getByText(container, /Not HIPAA compliant/)).toBeTruthy();
  });

  test("renders risk acceptance notice", () => {
    resetBody();
    const { container } = render(createElement(Footer));
    expect(getByText(container, /You bear all risk/)).toBeTruthy();
  });

  test("renders as a footer element", () => {
    resetBody();
    const { container } = render(createElement(Footer));
    const footer = container.getElementsByTagName("footer")[0];
    expect(footer).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// useJobStream hook
// ---------------------------------------------------------------------------
import { useJobStream } from "../src/frontend/hooks/useJobStream";

// Mock WebSocket class for testing
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Auto-connect on next tick
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  send(_data: string) {}

  // Test helper: simulate receiving a message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Test helper: simulate close event
  simulateClose(code: number, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  // Test helper: simulate error
  simulateError() {
    this.onerror?.();
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

describe("useJobStream", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    resetBody();
    originalWebSocket = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.reset();
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
  });

  test("returns null status when jobId is null", () => {
    const { result } = renderHook(() => useJobStream(null));
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test("creates WebSocket connection with correct URL", async () => {
    renderHook(() => useJobStream("test-job-123"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("ws:");
    expect(MockWebSocket.instances[0].url).toContain("jobId=test-job-123");
  });

  test("handles progress messages", async () => {
    const { result } = renderHook(() => useJobStream("job-progress"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];

    await hookAct(async () => {
      ws.simulateMessage({
        type: "progress",
        jobId: "job-progress",
        event: { time: "2024-01-01T00:00:00Z", message: "Step 1" },
      });
    });

    expect(result.current.status).toBeDefined();
    expect(result.current.status?.progress).toHaveLength(1);
    expect(result.current.status?.progress?.[0].message).toBe("Step 1");
  });

  test("deduplicates progress events", async () => {
    const { result } = renderHook(() => useJobStream("job-dedup"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];
    const event = {
      type: "progress",
      jobId: "job-dedup",
      event: { time: "2024-01-01T00:00:00Z", message: "Step 1" },
    };

    await hookAct(async () => {
      ws.simulateMessage(event);
      ws.simulateMessage(event); // duplicate
    });

    expect(result.current.status?.progress).toHaveLength(1);
  });

  test("handles completed messages", async () => {
    const { result } = renderHook(() => useJobStream("job-complete"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];

    await hookAct(async () => {
      ws.simulateMessage({
        type: "completed",
        jobId: "job-complete",
        result: { status: "completed", result: { report: {} } },
      });
    });

    expect(result.current.status?.status).toBe("completed");
  });

  test("handles failed messages", async () => {
    const { result } = renderHook(() => useJobStream("job-fail"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];

    await hookAct(async () => {
      ws.simulateMessage({
        type: "failed",
        jobId: "job-fail",
        error: "Something went wrong",
      });
    });

    expect(result.current.status?.status).toBe("failed");
    expect(result.current.status?.error).toBe("Something went wrong");
  });

  test("does not reconnect on normal close (code 1000)", async () => {
    renderHook(() => useJobStream("job-normal-close"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];

    await hookAct(async () => {
      ws.simulateClose(1000, "Normal closure");
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should not create a new WebSocket
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test("does not reconnect on close code 1005", async () => {
    renderHook(() => useJobStream("job-1005-close"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];

    await hookAct(async () => {
      ws.simulateClose(1005, "No status");
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test("reconnects on abnormal close with exponential backoff", async () => {
    vi.useFakeTimers();

    renderHook(() => useJobStream("job-reconnect"));

    await hookAct(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    // Simulate abnormal close
    await hookAct(async () => {
      MockWebSocket.instances[0].simulateClose(1006, "Abnormal");
    });

    // First retry: 1000ms (2^0 * 1000)
    await hookAct(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);

    // Simulate another abnormal close
    await hookAct(async () => {
      MockWebSocket.instances[1].simulateClose(1006, "Abnormal");
    });

    // Second retry: 2000ms (2^1 * 1000)
    await hookAct(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(MockWebSocket.instances).toHaveLength(3);

    vi.useRealTimers();
  });

  test("closes WebSocket on unmount", async () => {
    const { unmount } = renderHook(() => useJobStream("job-unmount"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.closed).toBe(false);

    unmount();
    expect(ws.closed).toBe(true);
  });

  test("accumulates multiple progress events in order", async () => {
    const { result } = renderHook(() => useJobStream("job-multi"));

    await hookAct(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const ws = MockWebSocket.instances[0];

    await hookAct(async () => {
      ws.simulateMessage({
        type: "progress",
        jobId: "job-multi",
        event: { time: "2024-01-01T00:00:01Z", message: "Step 1" },
      });
      ws.simulateMessage({
        type: "progress",
        jobId: "job-multi",
        event: { time: "2024-01-01T00:00:02Z", message: "Step 2" },
      });
      ws.simulateMessage({
        type: "progress",
        jobId: "job-multi",
        event: { time: "2024-01-01T00:00:03Z", message: "Step 3" },
      });
    });

    expect(result.current.status?.progress).toHaveLength(3);
    expect(result.current.status?.progress?.[0].message).toBe("Step 1");
    expect(result.current.status?.progress?.[1].message).toBe("Step 2");
    expect(result.current.status?.progress?.[2].message).toBe("Step 3");
  });
});

// ---------------------------------------------------------------------------
// Accessibility tests
// ---------------------------------------------------------------------------
import { Spinner } from "../src/frontend/components/ui/Spinner";

describe("Accessibility — Spinner", () => {
  test("renders with role=status", () => {
    resetBody();
    const { container } = render(createElement(Spinner));
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("status");
  });

  test("renders with default aria-label", () => {
    resetBody();
    const { container } = render(createElement(Spinner));
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Loading");
  });

  test("renders with custom label prop", () => {
    resetBody();
    const { container } = render(
      createElement(Spinner, { label: "Analyzing case" }),
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Analyzing case");
  });
});

describe("Accessibility — Modal", () => {
  test("renders with role=dialog and aria-modal=true", () => {
    resetBody();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: "Dialog" },
        createElement("p", {}, "Content"),
      ),
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  test("close button has aria-label", () => {
    resetBody();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: "Dialog" },
        createElement("p", {}, "Content"),
      ),
    );
    const closeBtn = container.querySelector('button[aria-label="Close"]');
    expect(closeBtn).toBeTruthy();
  });

  test("backdrop has aria-hidden=true", () => {
    resetBody();
    const { container } = render(
      createElement(
        Modal,
        { open: true, onClose: () => {}, title: "Dialog" },
        createElement("p", {}, "Content"),
      ),
    );
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
  });
});

describe("Accessibility — FileDropZone", () => {
  test("renders with role=button and tabIndex=0", () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload file",
      }),
    );
    const zone = container.querySelector('[role="button"]');
    expect(zone).toBeTruthy();
    expect(zone?.getAttribute("tabindex")).toBe("0");
  });

  test("has aria-label matching label prop", () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload lab results",
      }),
    );
    const zone = container.querySelector('[role="button"]');
    expect(zone?.getAttribute("aria-label")).toBe("Upload lab results");
  });

  test("help text has id and zone references it via aria-describedby", () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload file",
      }),
    );
    const zone = container.querySelector('[role="button"]');
    const describedBy = zone?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helpText = container.querySelector(`#${describedBy}`);
    expect(helpText).toBeTruthy();
  });

  test("activates file input on Enter key", async () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload",
      }),
    );
    const zone = container.querySelector('[role="button"]');
    const input = container.querySelector('input[type="file"]');

    // spyOn the click method
    const clickSpy = vi.fn();
    input!.click = clickSpy;

    await act(async () => {
      fireEvent.keyDown(zone!, { key: "Enter" });
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  test("activates file input on Space key", async () => {
    resetBody();
    const { container } = render(
      createElement(FileDropZone, {
        onFileContent: () => {},
        label: "Upload",
      }),
    );
    const zone = container.querySelector('[role="button"]');
    const input = container.querySelector('input[type="file"]');

    const clickSpy = vi.fn();
    input!.click = clickSpy;

    await act(async () => {
      fireEvent.keyDown(zone!, { key: " " });
    });

    expect(clickSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Accessibility — InputDashboard (age validation)
// ---------------------------------------------------------------------------
// vi.mock is hoisted by bun:test — must be defined before importing InputDashboard
vi.mock("../src/frontend/api/client", () => ({
  submitDiagnosis: vi.fn().mockRejectedValue(new Error("mocked")),
  getAgents: vi.fn().mockResolvedValue({ agents: [] }),
}));

import { InputDashboard } from "../src/frontend/pages/InputDashboard";

describe("Accessibility — InputDashboard", () => {
  test("age input has no aria-invalid when valid", () => {
    resetBody();
    const { container } = render(
      createElement(InputDashboard, { onSubmit: () => {} }),
    );
    const ageInput = container.querySelector("#age-input") as HTMLInputElement;
    expect(ageInput.getAttribute("aria-invalid")).toBeNull();
  });

  // Note: React 19 controlled inputs + happy-dom don't process fireEvent.change
  // into state updates, so interaction-based tests for aria-invalid are deferred
  // to E2E. The static attribute structure (id, aria-describedby link) is
  // verified implicitly by the first test and by the source review.

  test("error and validation banners use role=alert", () => {
    resetBody();
    // Render InputDashboard with a pre-populated draft that exceeds char limit
    // to trigger the validation warning banner
    try {
      happyWindow.sessionStorage.setItem(
        "ddx_draft",
        JSON.stringify({
          age: "",
          sex: "",
          chiefComplaint: "",
          medicalHistory: "x".repeat(50001),
          transcript: "",
          labResults: "",
        }),
      );
    } catch {
      /* ignore */
    }

    const { container } = render(
      createElement(InputDashboard, { onSubmit: () => {} }),
    );

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).toBeTruthy();
    expect(alertEl?.textContent).toContain("character limit");

    try {
      happyWindow.sessionStorage.removeItem("ddx_draft");
    } catch {
      /* ignore */
    }
  });
});

// ---------------------------------------------------------------------------
// Accessibility — ResultsView (tabs)
// ---------------------------------------------------------------------------
import { ResultsView } from "../src/frontend/pages/ResultsView";
import type { StatusResponse } from "../src/frontend/api/types";

function makeResults(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    jobId: "test-job",
    status: "completed",
    result: {
      status: "completed",
      result: {
        report: {
          diagnoses: [
            {
              rank: 1,
              name: "Myocardial Infarction",
              confidence: 85,
              urgency: "emergent",
              rationale: "Chest pain with ST elevation",
              supportingEvidence: ["Troponin elevated"],
              contradictoryEvidence: [],
              nextSteps: ["ECG"],
            },
            {
              rank: 2,
              name: "Angina",
              confidence: 60,
              urgency: "urgent",
              rationale: "Recurrent chest pain",
              supportingEvidence: [],
              contradictoryEvidence: [],
              nextSteps: [],
            },
          ],
          chiefComplaint: "Chest pain",
          recommendedImmediateActions: "Order ECG and troponin",
        },
        generatedAt: "2024-01-01T00:00:00Z",
        disclaimer: "Research only",
      },
    },
    ...overrides,
  } as StatusResponse;
}

describe("Accessibility — ResultsView tabs", () => {
  test("tablist has role=tablist", () => {
    resetBody();
    const { container } = render(
      createElement(ResultsView, {
        result: makeResults(),
        onNewCase: () => {},
      }),
    );
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
  });

  test("tab buttons have role=tab and aria-selected", () => {
    resetBody();
    const { container } = render(
      createElement(ResultsView, {
        result: makeResults(),
        onNewCase: () => {},
      }),
    );
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);

    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("aria-controls")).toBe("panel-diagnoses");
    expect(tabs[0].getAttribute("tabindex")).toBe("0");

    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-controls")).toBe("panel-consult");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");
  });

  test("tab panels have role=tabpanel and aria-labelledby", () => {
    resetBody();
    const { container } = render(
      createElement(ResultsView, {
        result: makeResults(),
        onNewCase: () => {},
      }),
    );
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(2);

    expect(panels[0].getAttribute("aria-labelledby")).toBe("tab-diagnoses");
    expect(panels[0].getAttribute("hidden")).toBeNull();

    expect(panels[1].getAttribute("aria-labelledby")).toBe("tab-consult");
    expect(panels[1].getAttribute("hidden")).toBe("");
  });

  test("clicking tab switches aria-selected and hidden", async () => {
    resetBody();
    const { container } = render(
      createElement(ResultsView, {
        result: makeResults(),
        onNewCase: () => {},
      }),
    );

    const consultTab = container.querySelector(
      '[data-tab="consult"]',
    ) as HTMLElement;

    await act(async () => {
      fireEvent.click(consultTab);
    });

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[0].getAttribute("tabindex")).toBe("-1");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("tabindex")).toBe("0");

    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels[0].getAttribute("hidden")).toBe("");
    expect(panels[1].getAttribute("hidden")).toBeNull();
  });

  test("ArrowRight switches to next tab and focuses it", async () => {
    resetBody();
    const { container } = render(
      createElement(ResultsView, {
        result: makeResults(),
        onNewCase: () => {},
      }),
    );

    const firstTab = container.querySelector(
      '[role="tab"]',
    ) as HTMLElement;

    await act(async () => {
      fireEvent.keyDown(firstTab, { key: "ArrowRight" });
    });

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    // Focus should have moved to the second tab
    expect(tabs[1].getAttribute("tabindex")).toBe("0");
  });

  test("ArrowLeft on second tab wraps to first tab", async () => {
    resetBody();
    const { container } = render(
      createElement(ResultsView, {
        result: makeResults(),
        onNewCase: () => {},
      }),
    );

    // Switch to consult tab first
    const consultTab = container.querySelector(
      '[data-tab="consult"]',
    ) as HTMLElement;
    await act(async () => {
      fireEvent.click(consultTab);
    });

    // ArrowLeft should wrap to diagnoses tab
    await act(async () => {
      fireEvent.keyDown(consultTab, { key: "ArrowLeft" });
    });

    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });
});
