locals {
  log-group-name     = coalesce(var.log-group-name, "${var.token}/${var.service-name}")
  shared-alb-name    = "${var.token}-alb-external"
  tg-shared-name     = substr("${var.token}-${var.service-name}", 0, 32)
  service-repository = coalesce(var.service-repository, "${var.container-registry}/${var.service-repo-prefix}/${var.service-name}")
  service-image      = "${local.service-repository}:${var.service-version}"
}
