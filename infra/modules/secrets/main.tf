locals {
  service_names = ["auth", "company", "catalog", "order", "payment"]
}

resource "aws_secretsmanager_secret" "db_url" {
  for_each                = toset(local.service_names)
  name                    = "ordin/${var.environment}/db/${each.key}"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "ordin/${var.environment}/jwt_secret"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "qr_secret" {
  name                    = "ordin/${var.environment}/qr_secret"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "internal_secret" {
  name                    = "ordin/${var.environment}/internal_secret"
  recovery_window_in_days = 7

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
