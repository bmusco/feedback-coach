resource "aws_secretsmanager_secret" "claude-config" {
  name        = "${var.token}/${var.service-name}/claude_config"
  description = "Claude CLI configuration for ${var.service-name} (base64 tar.gz of ~/.claude)"
}

resource "aws_secretsmanager_secret" "oauth-credentials" {
  name        = "${var.token}/${var.service-name}/oauth_credentials"
  description = "OAuth client credentials and session secret for ${var.service-name}"
}
