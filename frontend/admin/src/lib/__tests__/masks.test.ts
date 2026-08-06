import { describe, expect, it } from "vitest";
import { formatCep, formatCnpj, formatCpf } from "../masks";

describe("formatCnpj", () => {
  it("aplica a máscara XX.XXX.XXX/XXXX-XX progressivamente", () => {
    expect(formatCnpj("11")).toBe("11");
    expect(formatCnpj("11222")).toBe("11.222");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("aceita entrada já mascarada sem duplicar pontuação", () => {
    expect(formatCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });
});

describe("formatCpf", () => {
  it("aplica a máscara XXX.XXX.XXX-XX", () => {
    expect(formatCpf("11144477735")).toBe("111.444.777-35");
  });
});

describe("formatCep", () => {
  it("aplica a máscara XXXXX-XXX", () => {
    expect(formatCep("01310100")).toBe("01310-100");
  });
});
