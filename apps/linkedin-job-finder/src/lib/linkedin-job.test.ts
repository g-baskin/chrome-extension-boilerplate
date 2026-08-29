import { describe, expect, it } from "vitest";
import { canonicalLinkedInJobUrl, collectLinkedInJobIds, extractLinkedInJob, getLinkedInJobId } from "./linkedin-job";

function root(values: Record<string, string>) {
  return { querySelector: (selector: string) => values[selector] ? { textContent: values[selector] } : null } as unknown as Pick<Document, "querySelector">;
}

describe("LinkedIn job extraction", () => {
  it("accepts only exact HTTPS LinkedIn hosts and supported ID shapes", () => {
    expect(getLinkedInJobId("https://www.linkedin.com/jobs/view/12345/?x=1")).toBe("12345");
    expect(getLinkedInJobId("https://linkedin.com/jobs/search/?currentJobId=987")).toBe("987");
    expect(getLinkedInJobId("http://www.linkedin.com/jobs/view/1")).toBeNull();
    expect(getLinkedInJobId("https://linkedin.com.evil.test/jobs/view/1")).toBeNull();
  });

  it("emits a stable canonical URL", () => {
    expect(canonicalLinkedInJobUrl("123")).toBe("https://www.linkedin.com/jobs/view/123/");
  });

  it("collects unique bounded LinkedIn IDs from untrusted card links", () => {
    const urls = [
      "https://www.linkedin.com/jobs/view/1/",
      "https://www.linkedin.com/jobs/view/1/?duplicate=true",
      "https://linkedin.com/jobs/view/2/",
      "https://linkedin.com.evil.test/jobs/view/3/",
      ...Array.from({ length: 20 }, (_, index) => `https://www.linkedin.com/jobs/view/${index + 10}/`),
    ];
    expect(collectLinkedInJobIds(urls)).toEqual(["1", "2", "10", "11", "12", "13", "14", "15", "16", "17"]);
  });

  it("uses selector fallbacks and normalizes whitespace", () => {
    const job = extractLinkedInJob(root({
      ".jobs-unified-top-card__job-title": "  Staff\n Engineer ",
      ".jobs-unified-top-card__company-name": " Example   Co ",
      ".topcard__flavor--bullet": " Remote ",
      ".show-more-less-html__markup": " Build\n reliable systems ",
    }), "https://www.linkedin.com/jobs/view/123/");
    expect(job).toMatchObject({ id: "123", title: "Staff Engineer", company: "Example Co", location: "Remote", description: "Build reliable systems" });
  });

  it("supports LinkedIn's current SDUI title link and about-the-job component", () => {
    const job = extractLinkedInJob(root({
      "a[href*='/jobs/view/123/']": "SIEM Engineer",
      "[data-sdui-component$='.aboutTheJob']": "About the job Monitor and investigate security events.",
    }), "https://www.linkedin.com/jobs/search/?currentJobId=123");
    expect(job).toMatchObject({ title: "SIEM Engineer", description: "About the job Monitor and investigate security events." });
  });

  it("requires bounded title and description fields", () => {
    const job = extractLinkedInJob(root({ h1: "x".repeat(400), "#job-details": "d".repeat(25_000) }), "https://linkedin.com/jobs/view/7");
    expect(job?.title).toHaveLength(300);
    expect(job?.description).toHaveLength(20_000);
    expect(extractLinkedInJob(root({ h1: "Title" }), "https://linkedin.com/jobs/view/7")).toBeNull();
  });
});
