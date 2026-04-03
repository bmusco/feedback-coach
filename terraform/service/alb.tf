resource "aws_lb_target_group" "service" {
  name                 = local.tg-shared-name
  port                 = var.container-port
  protocol             = "HTTP"
  protocol_version     = "HTTP1"
  target_type          = var.network-mode == "awsvpc" ? "ip" : "instance"
  vpc_id               = data.aws_vpc.vpc.id
  deregistration_delay = var.alb-deregistration-delay

  health_check {
    protocol = "HTTP"
    path     = "/api/health"
  }
}

resource "aws_lb_listener_rule" "service" {
  listener_arn = data.aws_lb_listener.shared-alb443.arn
  priority     = var.alb-listener-priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service.arn
  }

  condition {
    host_header {
      values = [var.api-hostname]
    }
  }
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.int-tools.zone_id
  name    = var.api-hostname
  type    = "A"

  alias {
    name                   = data.aws_lb.shared-alb.dns_name
    zone_id                = data.aws_lb.shared-alb.zone_id
    evaluate_target_health = true
  }
}
