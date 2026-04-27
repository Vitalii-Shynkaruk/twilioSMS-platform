import { describe, expect, it } from "vitest";
import { AIService } from "../src/services/aiService";

describe("AIService CA compliance and scoring", () => {
  it("includes California compliance block in system prompt when isCA is true", async () => {
    const getSystemPrompt = (AIService as unknown as { getSystemPrompt: (isCA: boolean) => Promise<string> }).getSystemPrompt;

    const prompt = await getSystemPrompt(true);

    expect(prompt).toContain("CA");
    expect(prompt).toMatch(/California-safe|CA COMPLIANCE MODE/i);
  });

  it("does not include California compliance block in system prompt when isCA is false", async () => {
    const getSystemPrompt = (AIService as unknown as { getSystemPrompt: (isCA: boolean) => Promise<string> }).getSystemPrompt;

    const prompt = await getSystemPrompt(false);

    expect(prompt).not.toContain("CA NOTE:");
  });

  it("computes high score for hot and urgent high-value lead", () => {
    const score = AIService.computeLeadScore({
      classification: "HOT",
      revenueMonthly: 75000,
      askLabel: "$1.2M",
      urgency: "today",
      lastInboundAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("keeps score lower for nurture lead without urgency and value signals", () => {
    const score = AIService.computeLeadScore({
      classification: "NURTURE",
      revenueMonthly: null,
      askLabel: null,
      urgency: "no urgency",
      lastInboundAt: null,
    });

    expect(score).toBeLessThanOrEqual(25);
  });
});
