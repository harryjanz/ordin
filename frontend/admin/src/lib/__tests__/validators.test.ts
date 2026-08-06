import { describe, expect, it } from "vitest";
import { isValidCep, isValidCnpj, isValidCpf, normalizeCnpj, normalizeCpf } from "../validators";

describe("isValidCnpj", () => {
  it("aceita CNPJ numérico válido, com ou sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("04.252.011/0001-10")).toBe(true);
  });

  it("aceita CNPJ alfanumérico válido", () => {
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador incorreto", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("12ABC34501DE99")).toBe(false);
  });

  it("rejeita CNPJ com tamanho ou formato inválido", () => {
    expect(isValidCnpj("123456")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("normaliza removendo máscara", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("rejeita CNPJ totalmente zerado, mesmo o checksum matematicamente batendo (ORD-064)", () => {
    // 14 zeros produz DV "00", que coincide com os 2 últimos zeros da
    // própria string — passa no checksum por coincidência, não por ser
    // um CNPJ real. As referências oficiais (Java/TS do SERPRO) rejeitam
    // esse caso explicitamente.
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  // Vetores oficiais publicados pela Receita/SERPRO (PDF + exemplo Java) —
  // material local do usuário, não versionado (.gitignore:16), por isso
  // embutidos aqui diretamente. Espelha services/company/tests/test_ord064_cnpj_alfanumerico.py.
  it.each([
    ["12ABC34501DE35", true],
    ["1345C3A5000106", true],
    ["R55231B3000700", false],
    ["90.021.382/0001-22", true],
    ["90.024.778/000123", true],
    ["90.025.108/000101", false],
    ["90.025.255/0001", false],
    ["90.024.420/0001A2", false],
    ["R55231B3000757", true],
  ])("vetor oficial SERPRO: %s -> %s", (cnpj, esperado) => {
    expect(isValidCnpj(cnpj as string)).toBe(esperado);
  });

  // Massa adicional gerada e auto-validada — cobre letras em posições
  // variadas (não são vetores oficiais, só estresse de posição).
  it.each([
    "ABCDEFGHIJKL80",
    "A1B2C3D4E5F668",
    "1234567ABCDE88",
    "AB12CD34EF5602",
    "00A000B000C084",
    "ZZ999YY888XX24",
  ])("massa adicional — letras em posições variadas: %s", (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true);
  });
});

describe("isValidCpf", () => {
  it("aceita CPF válido conhecido", () => {
    expect(isValidCpf("111.444.777-35")).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("rejeita CPF com dígito verificador incorreto", () => {
    expect(isValidCpf("111.444.777-30")).toBe(false);
  });

  it("rejeita sequência de dígitos repetidos", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("normaliza removendo máscara", () => {
    expect(normalizeCpf("111.444.777-35")).toBe("11144477735");
  });
});

describe("isValidCep", () => {
  it("aceita CEP com 8 dígitos, com ou sem máscara", () => {
    expect(isValidCep("01310-100")).toBe(true);
    expect(isValidCep("01310100")).toBe(true);
  });

  it("rejeita CEP com tamanho incorreto", () => {
    expect(isValidCep("123")).toBe(false);
  });
});
