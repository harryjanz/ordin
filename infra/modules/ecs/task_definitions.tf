variable "secrets_module" {
  description = "Output do módulo secrets com ARNs"
  type = object({
    db_url_arns         = map(string)
    jwt_secret_arn      = string
    qr_secret_arn       = string
    internal_secret_arn = string
  })
}

locals {
  # Secrets injetados em TODOS os serviços
  common_secrets = [
    {
      name      = "INTERNAL_SECRET"
      valueFrom = "${var.secrets_module.internal_secret_arn}:secret::"
    }
  ]

  # Secrets específicos por serviço
  service_secrets = {
    auth = concat(local.common_secrets, [
      { name = "DB_URL",     valueFrom = "${var.secrets_module.db_url_arns["auth"]}:url::" },
      { name = "JWT_SECRET", valueFrom = "${var.secrets_module.jwt_secret_arn}:secret::" },
      { name = "QR_SECRET",  valueFrom = "${var.secrets_module.qr_secret_arn}:secret::" },
    ])
    company = concat(local.common_secrets, [
      { name = "DB_URL", valueFrom = "${var.secrets_module.db_url_arns["company"]}:url::" },
    ])
    catalog = concat(local.common_secrets, [
      { name = "DB_URL", valueFrom = "${var.secrets_module.db_url_arns["catalog"]}:url::" },
    ])
    order = concat(local.common_secrets, [
      { name = "DB_URL",    valueFrom = "${var.secrets_module.db_url_arns["order"]}:url::" },
      { name = "QR_SECRET", valueFrom = "${var.secrets_module.qr_secret_arn}:secret::" },
    ])
    payment = concat(local.common_secrets, [
      { name = "DB_URL", valueFrom = "${var.secrets_module.db_url_arns["payment"]}:url::" },
    ])
  }
}

# Uso: referenciar local.service_secrets["auth"] no bloco secrets da task definition
# Nunca usar o bloco "environment" para credenciais — aparece em texto puro no console AWS
