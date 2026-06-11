output "db_url_arns" {
  description = "ARNs dos secrets de DB_URL por serviço"
  value       = { for k, v in aws_secretsmanager_secret.db_url : k => v.arn }
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt_secret.arn
}

output "qr_secret_arn" {
  value = aws_secretsmanager_secret.qr_secret.arn
}

output "internal_secret_arn" {
  value = aws_secretsmanager_secret.internal_secret.arn
}
