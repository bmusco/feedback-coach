resource "aws_cloudwatch_log_group" "service" {
  name              = local.log-group-name
  retention_in_days = var.log-retention-days
}

resource "aws_ecs_task_definition" "service" {
  family                   = "${var.token}-${var.service-name}"
  network_mode             = var.network-mode
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task-execution-role.arn
  task_role_arn            = aws_iam_role.task-role.arn

  container_definitions = jsonencode([
    {
      name  = var.service-name
      image = local.service-image
      essential = true
      entryPoint = ["/app/entrypoint.sh"]
      command    = ["node", "server.js"]
      portMappings = [
        {
          hostPort      = var.container-port
          protocol      = "tcp"
          containerPort = var.container-port
        }
      ]
      environment = [
        { name = "PORT", value = tostring(var.container-port) },
        { name = "CORS_ORIGIN", value = var.frontend-url },
        { name = "NODE_ENV", value = "production" },
        { name = "AWS_DEFAULT_REGION", value = var.region },
        { name = "CLAUDE_CLI", value = "/home/appuser/.local/bin/claude" },
        { name = "OAUTH_CALLBACK_URL", value = "https://${var.api-hostname}/api/auth/callback" },
        { name = "ATLASSIAN_SITE", value = var.atlassian-site }
      ]
      secrets = [
        {
          name      = "CLAUDE_CONFIG_TAR_B64"
          valueFrom = aws_secretsmanager_secret.claude-config.arn
        },
        {
          name      = "SESSION_SECRET"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:SESSION_SECRET::"
        },
        {
          name      = "GOOGLE_CLIENT_ID"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:GOOGLE_CLIENT_ID::"
        },
        {
          name      = "GOOGLE_CLIENT_SECRET"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:GOOGLE_CLIENT_SECRET::"
        },
        {
          name      = "SLACK_CLIENT_ID_OAUTH"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:SLACK_CLIENT_ID_OAUTH::"
        },
        {
          name      = "SLACK_CLIENT_SECRET_OAUTH"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:SLACK_CLIENT_SECRET_OAUTH::"
        },
        {
          name      = "REQUIRE_GOOGLE_SIGNIN"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:REQUIRE_GOOGLE_SIGNIN::"
        },
        {
          name      = "ALLOWED_EMAIL_DOMAIN"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:ALLOWED_EMAIL_DOMAIN::"
        },
        {
          name      = "ALLOWED_USER_EMAILS"
          valueFrom = "${aws_secretsmanager_secret.oauth-credentials.arn}:ALLOWED_USER_EMAILS::"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.service.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = var.service-name
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container-port}/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }
    }
  ])
}

resource "aws_ecs_service" "service" {
  name            = var.service-name
  cluster         = "arn:aws:ecs:${var.region}:${var.aws-id}:cluster/${var.token}-${var.cluster-name}"
  task_definition = aws_ecs_task_definition.service.arn
  desired_count   = var.min-capacity

  enable_execute_command = var.enable-execute-command

  dynamic "capacity_provider_strategy" {
    for_each = var.capacity-provider-strategy
    content {
      capacity_provider = capacity_provider_strategy.value.capacity_provider
      base              = capacity_provider_strategy.value.base
      weight            = capacity_provider_strategy.value.weight
    }
  }

  depends_on = [aws_lb_listener_rule.service]

  load_balancer {
    target_group_arn = aws_lb_target_group.service.arn
    container_name   = var.service-name
    container_port   = var.container-port
  }

  deployment_circuit_breaker {
    enable   = var.enable-circuit-breaker
    rollback = var.circuit-breaker-rollback
  }

  network_configuration {
    assign_public_ip = false
    subnets          = data.aws_subnets.subnets.ids
    security_groups  = [aws_security_group.task.id]
  }

  force_new_deployment = var.force-new-deployment

  lifecycle {
    ignore_changes = [desired_count]
  }
}
