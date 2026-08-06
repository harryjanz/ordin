// Parser genérico do formato de erro do FastAPI/Pydantic.
//
// Hoje só existe um precedente no código (CompanyScreen.tsx, aba Pagamento)
// e ele só trata `detail` como string única. O formato real de erro de
// validação (422) é uma LISTA por campo:
//   {"detail": [{"loc": ["body", "document"], "msg": "CNPJ inválido", ...}]}
// Endpoints que levantam HTTPException(422, "mensagem") continuam retornando
// `detail` como string única — este parser cobre os dois formatos.

interface PydanticErrorItem {
  loc?: (string | number)[];
  msg?: string;
}

export interface ParsedApiError {
  message: string;
  fieldErrors: Record<string, string>;
}

function isPydanticErrorList(detail: unknown): detail is PydanticErrorItem[] {
  return Array.isArray(detail) && detail.every((d) => typeof d === "object" && d !== null && "msg" in d);
}

export function parseApiError(error: unknown): ParsedApiError {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;

  if (typeof detail === "string") {
    return { message: detail, fieldErrors: {} };
  }

  if (isPydanticErrorList(detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of detail) {
      const field = item.loc?.filter((l) => l !== "body" && l !== "query" && l !== "path").pop();
      if (field != null && item.msg) {
        fieldErrors[String(field)] = item.msg;
      }
    }
    const message = detail.map((d) => d.msg).filter(Boolean).join("; ") || "Erro de validação.";
    return { message, fieldErrors };
  }

  return { message: "Erro inesperado. Tente novamente.", fieldErrors: {} };
}
