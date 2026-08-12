import { describe, expect, it } from "vitest";
import { buildCompanyListQuery } from "../companies";

describe("buildCompanyListQuery", () => {
  it("usa skip/limit padrão quando nenhum filtro é informado", () => {
    expect(buildCompanyListQuery({})).toEqual({ skip: 0, limit: 50 });
  });

  it("inclui q só quando não vazio, removendo espaços nas pontas", () => {
    expect(buildCompanyListQuery({ q: "  sabor  " })).toEqual({ skip: 0, limit: 50, q: "sabor" });
    expect(buildCompanyListQuery({ q: "   " })).toEqual({ skip: 0, limit: 50 });
  });

  it("normaliza o CNPJ do filtro (remove máscara)", () => {
    expect(buildCompanyListQuery({ document: "11.222.333/0001-81" }))
      .toEqual({ skip: 0, limit: 50, document: "11222333000181" });
  });

  it("filtra por prefixo a partir de 3 dígitos — abaixo disso ignora (largo demais)", () => {
    expect(buildCompanyListQuery({ document: "1" })).toEqual({ skip: 0, limit: 50 });
    expect(buildCompanyListQuery({ document: "11" })).toEqual({ skip: 0, limit: 50 });
    expect(buildCompanyListQuery({ document: "11.222" }))
      .toEqual({ skip: 0, limit: 50, document: "11222" });
  });

  it("inclui contract_status só quando um valor é selecionado", () => {
    expect(buildCompanyListQuery({ contractStatus: "enviado" }))
      .toEqual({ skip: 0, limit: 50, contract_status: "enviado" });
    expect(buildCompanyListQuery({ contractStatus: "" })).toEqual({ skip: 0, limit: 50 });
  });

  it("inclui date_from/date_to só quando informados (ORD-084)", () => {
    expect(buildCompanyListQuery({ dateFrom: "2026-08-01" }))
      .toEqual({ skip: 0, limit: 50, date_from: "2026-08-01" });
    expect(buildCompanyListQuery({ dateFrom: "2026-08-01", dateTo: "2026-08-31" }))
      .toEqual({ skip: 0, limit: 50, date_from: "2026-08-01", date_to: "2026-08-31" });
    expect(buildCompanyListQuery({})).toEqual({ skip: 0, limit: 50 });
  });

  it("combina todos os filtros e paginação simultaneamente", () => {
    expect(buildCompanyListQuery({
      q: "sabor", document: "11222333000181", contractStatus: "pendente",
      dateFrom: "2026-08-01", dateTo: "2026-08-31", skip: 50, limit: 20,
    })).toEqual({
      skip: 50, limit: 20, q: "sabor", document: "11222333000181", contract_status: "pendente",
      date_from: "2026-08-01", date_to: "2026-08-31",
    });
  });
});
