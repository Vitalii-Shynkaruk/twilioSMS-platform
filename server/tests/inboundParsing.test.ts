import { describe, expect, it } from "vitest";
import { phoneDigits, phoneLookupVariants, splitContactName } from "../src/webhooks/inboundParsing";

describe("inboundParsing helpers", () => {
  it("normalizes digits from mixed phone formats", () => {
    expect(phoneDigits("+1 (646) 555-0123")).toBe("16465550123");
    expect(phoneDigits("646-555-0123")).toBe("6465550123");
  });

  it("builds variants for local 10-digit number", () => {
    const variants = phoneLookupVariants("6465550123");

    expect(variants).toContain("6465550123");
    expect(variants).toContain("+6465550123");
    expect(variants).toContain("16465550123");
    expect(variants).toContain("+16465550123");
  });

  it("builds variants for US number with country code", () => {
    const variants = phoneLookupVariants("+1 (646) 555-0123");

    expect(variants).toContain("16465550123");
    expect(variants).toContain("+16465550123");
    expect(variants).toContain("6465550123");
    expect(variants).toContain("+16465550123");
  });

  it("splits contact name into first and last names", () => {
    expect(splitContactName("John A Doe")).toEqual({ firstName: "John", lastName: "A Doe" });
    expect(splitContactName("  Madonna  ")).toEqual({ firstName: "Madonna", lastName: "" });
    expect(splitContactName("")).toEqual({ firstName: "", lastName: "" });
  });
});
