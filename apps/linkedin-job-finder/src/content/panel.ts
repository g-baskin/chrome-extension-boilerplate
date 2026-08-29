import type { ExtractedJob, JobMatch } from "../lib/types";
import panelCss from "./panel.css?inline";

export type PanelState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "ready"; job: ExtractedJob; match: JobMatch; saved: boolean }
  | { kind: "saving"; job: ExtractedJob; match: JobMatch }
  | { kind: "save-error"; job: ExtractedJob; match: JobMatch; message: string };

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function termsRow(label: string, terms: string[], kind: string): HTMLElement {
  const row = element("div", `ledger-row ledger-row--${kind}`);
  row.append(element("strong", "ledger-label", label), element("span", "ledger-terms", terms.length ? terms.join(", ") : "None"));
  return row;
}

export class MatchPanel {
  private readonly root: ShadowRoot;
  private state: PanelState = { kind: "loading" };

  constructor(private readonly onSave: (job: ExtractedJob, match: JobMatch) => Promise<void>) {
    const host = element("aside");
    host.id = "linkedin-job-finder-root";
    host.setAttribute("aria-label", "LinkedIn Job Finder");
    this.root = host.attachShadow({ mode: "closed" });
    const style = element("style");
    style.textContent = panelCss;
    this.root.append(style, element("section", "panel"));
    document.body.append(host);
    this.render();
  }

  setState(state: PanelState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    const panel = this.root.querySelector<HTMLElement>(".panel");
    if (!panel) return;
    panel.replaceChildren();
    const header = element("header", "panel-header");
    header.append(element("span", "mark", "JF"), element("strong", "product", "Job Finder"));
    panel.append(header);

    if (this.state.kind === "loading") {
      panel.append(element("p", "message", "Reading the open job…"));
      return;
    }
    if (this.state.kind === "unsupported") {
      panel.append(element("h2", "title", "No open job found"), element("p", "message", "Open a LinkedIn job to compare it with your keyword rules."));
      return;
    }

    const { job, match } = this.state;
    const excluded = match.matchedExcluded.length > 0;
    const missing = match.missingRequired.length > 0;
    const status = excluded ? "Excluded term found" : missing ? "Required terms missing" : "Eligible match";
    const statusClass = excluded ? "danger" : missing ? "warning" : "success";
    panel.append(element("p", `status status--${statusClass}`, status));
    panel.append(element("h2", "title", job.title));
    panel.append(element("p", "meta", [job.company, job.location].filter(Boolean).join(" · ")));
    panel.append(element("p", "score", `${match.positiveMatched} of ${match.positiveTotal} positive keywords`));

    const ledger = element("div", "ledger");
    ledger.setAttribute("aria-label", "Match evidence");
    ledger.append(
      termsRow("Matched", [...match.matchedRequired, ...match.matchedPreferred], "matched"),
      termsRow("Missing", match.missingRequired, "missing"),
      termsRow("Excluded", match.matchedExcluded, "excluded"),
    );
    panel.append(ledger);

    const button = element("button", "save-button", this.state.kind === "saving" ? "Saving…" : this.state.kind === "ready" && this.state.saved ? "Saved" : "Save job");
    button.type = "button";
    button.disabled = this.state.kind === "saving" || (this.state.kind === "ready" && this.state.saved);
    button.addEventListener("click", () => {
      this.setState({ kind: "saving", job, match });
      void this.onSave(job, match).then(
        () => this.setState({ kind: "ready", job, match, saved: true }),
        () => this.setState({ kind: "save-error", job, match, message: "Could not save. Try again." }),
      );
    });
    panel.append(button);
    if (this.state.kind === "save-error") panel.append(element("p", "error", this.state.message));
  }
}
