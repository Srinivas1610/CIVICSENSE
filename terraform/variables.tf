# ============================================================
# CivicConnect — Terraform Variables
# ============================================================

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "civicconnect"
}

variable "aws_region" {
  description = "AWS region for deployment (free tier available in most regions)"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. t2.micro is Free Tier eligible (1 vCPU, 1GB RAM)"
  type        = string
  default     = "t2.micro"
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed SSH access. Use your IP: curl ifconfig.me/ip"
  type        = string
  default     = "0.0.0.0/0"  # Restrict to your IP in production!
}
