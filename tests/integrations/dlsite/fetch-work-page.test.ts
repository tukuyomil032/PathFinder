import { describe, expect, it, vi } from "vitest";
import { buildWorkUrl, fetchWorkPage } from "../../../src/integrations/dlsite/fetch-work-page";
import { FetchWorkPageError } from "../../../src/integrations/dlsite/errors";

describe("fetchWorkPage", () => {
  it("builds the expected DLSite URL", () => {
    expect(buildWorkUrl("rj012345")).toBe(
      "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
    );
  });

  it("returns html on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 }));

    await expect(
      fetchWorkPage("RJ012345", {
        fetchImpl,
        userAgent: "test-agent",
      }),
    ).resolves.toBe("<html></html>");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
      {
        headers: {
          "user-agent": "test-agent",
        },
      },
    );
  });

  it("throws a typed error on http failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));

    await expect(
      fetchWorkPage("RJ404404", {
        fetchImpl,
        userAgent: "test-agent",
      }),
    ).rejects.toBeInstanceOf(FetchWorkPageError);
  });

  it("throws a typed error on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      fetchWorkPage("RJ999999", {
        fetchImpl,
        userAgent: "test-agent",
      }),
    ).rejects.toBeInstanceOf(FetchWorkPageError);
  });
});
