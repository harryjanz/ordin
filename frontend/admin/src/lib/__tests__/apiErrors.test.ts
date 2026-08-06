import { describe, expect, it } from "vitest";
import { parseApiError } from "../apiErrors";

describe("parseApiError", () => {
  it("trata detail como string única (HTTPException simples)", () => {
    const err = { response: { data: { detail: "CNPJ inválido" } } };
    const result = parseApiError(err);
    expect(result.message).toBe("CNPJ inválido");
    expect(result.fieldErrors).toEqual({});
  });

  it("trata detail como lista de erros por campo (Pydantic 422)", () => {
    const err = {
      response: {
        data: {
          detail: [
            { loc: ["body", "document"], msg: "CNPJ inválido" },
            { loc: ["body", "rep_cpf"], msg: "CPF inválido" },
          ],
        },
      },
    };
    const result = parseApiError(err);
    expect(result.fieldErrors.document).toBe("CNPJ inválido");
    expect(result.fieldErrors.rep_cpf).toBe("CPF inválido");
    expect(result.message).toContain("CNPJ inválido");
  });

  it("retorna mensagem genérica quando não há detail reconhecível", () => {
    const result = parseApiError({});
    expect(result.message).toBe("Erro inesperado. Tente novamente.");
    expect(result.fieldErrors).toEqual({});
  });
});
