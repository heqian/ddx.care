import { Window as HappyWindow } from "happy-dom";
import { test, expect, describe, beforeEach, vi } from "bun:test";

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
});

// Create a fresh body for each test render
function resetBody() {
  happyDocument.body.innerHTML = "";
}

// Helper: query rendered output for text content
// Uses recursive descent to match against element textContent (handles split React text nodes)
function queryByText(container: Element, text: string | RegExp): Element | null {
  const queue: Element[] = [container];
  while (queue.length > 0) {
    const el = queue.shift()!;
    // Check this element's direct text (not children's)
    const ownText = el.textContent ?? "";
    const matches = typeof text === "string" ? ownText.includes(text) : text.test(ownText);
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

function queryAllByText(container: Element, text: string | RegExp): Element[] {
  const results: Element[] = [];
  const walker = happyDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const nodeText = walker.currentNode.textContent ?? "";
    const matches = typeof text === "string" ? nodeText.includes(text) : text.test(nodeText);
    if (matches && walker.currentNode.parentElement) {
      results.push(walker.currentNode.parentElement);
    }
  }
  return results;
}

import { render, fireEvent, act } from "@testing-library/react";
import React, { createElement } from "react";

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
    const { container } = render(createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ name: "Migraine" }) }));
    expect(getByText(container, "Migraine")).toBeTruthy();
    expect(getByText(container, "1")).toBeTruthy();
  });

  test("renders confidence badge text", () => {
    resetBody();
    const { container } = render(createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ confidence: 85 }) }));
    expect(getByText(container, "85% confidence")).toBeTruthy();
  });

  test("renders urgency badge text", () => {
    resetBody();
    const { container } = render(createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ urgency: "emergent" }) }));
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
        diagnosis: makeDiagnosis({ contradictoryEvidence: ["No prior history"] }),
      }),
    );
    expect(getByText(container, "No prior history")).toBeTruthy();
  });

  test("renders next steps", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({ nextSteps: ["Order CT scan", "Administer meds"] }),
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
    const { container } = render(createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ rank: 2 }) }));
    expect(getByText(container, "2")).toBeTruthy();
  });

  test("renders rank 3 with correct badge", () => {
    resetBody();
    const { container } = render(createElement(DiagnosisCard, { diagnosis: makeDiagnosis({ rank: 3 }) }));
    expect(getByText(container, "3")).toBeTruthy();
  });

  test("renders rationale text", () => {
    resetBody();
    const { container } = render(
      createElement(DiagnosisCard, {
        diagnosis: makeDiagnosis({ rationale: "Patient has classic symptoms." }),
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
    const { container } = render(createElement(ConfidenceBadge, { confidence: 75 }));
    expect(getByText(container, "75% confidence")).toBeTruthy();
  });

  test("returns null for null confidence", () => {
    resetBody();
    const { container } = render(createElement(ConfidenceBadge, { confidence: null }));
    expect(container.innerHTML).toBe("");
  });

  test("high confidence gets green styling", () => {
    resetBody();
    const { container } = render(createElement(ConfidenceBadge, { confidence: 90 }));
    const badge = getByText(container, "90% confidence");
    expect(badge.className).toContain("bg-green");
  });

  test("medium confidence gets yellow styling", () => {
    resetBody();
    const { container } = render(createElement(ConfidenceBadge, { confidence: 50 }));
    const badge = getByText(container, "50% confidence");
    expect(badge.className).toContain("bg-yellow");
  });

  test("low confidence gets red styling", () => {
    resetBody();
    const { container } = render(createElement(ConfidenceBadge, { confidence: 20 }));
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
    const { container } = render(createElement(UrgencyBadge, { urgency: "emergent" }));
    expect(getByText(container, "Emergent")).toBeTruthy();
  });

  test("renders urgent label", () => {
    resetBody();
    const { container } = render(createElement(UrgencyBadge, { urgency: "urgent" }));
    expect(getByText(container, "Urgent")).toBeTruthy();
  });

  test("renders routine label", () => {
    resetBody();
    const { container } = render(createElement(UrgencyBadge, { urgency: "routine" }));
    expect(getByText(container, "Routine")).toBeTruthy();
  });

  test("returns null for null urgency", () => {
    resetBody();
    const { container } = render(createElement(UrgencyBadge, { urgency: null }));
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
    const { container } = render(createElement(FileDropZone, { onFileContent: () => {}, label: "Upload lab results" }));
    expect(getByText(container, "Upload lab results")).toBeTruthy();
  });

  test("renders accept hint", () => {
    resetBody();
    const { container } = render(createElement(FileDropZone, { onFileContent: () => {}, label: "Upload", accept: ".txt,.csv" }));
    expect(getByText(container, /\.txt,\.csv/)).toBeTruthy();
  });

  test("calls onFileContent when file is selected", async () => {
    resetBody();
    const onFileContent = vi.fn();
    const { container } = render(createElement(FileDropZone, { onFileContent, label: "Upload" }));

    const file = new happyWindow.File(["file content"], "test.txt", { type: "text/plain" });

    // Find the hidden input by traversing children
    const input = Array.from(container.getElementsByTagName("input"))[0] as HTMLInputElement;

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
